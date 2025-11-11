"""
Calibration harness for NLP entity linker.

Computes precision, recall, F1, and Brier score on gold set.
Run weekly to track linker quality over time.
"""

import json
import sys
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional

from nexus.ontology.db import get_db_connection
from nexus.ontology.nlp_linker import NLPLinker


class LinkerCalibration:
    """Calibration harness for entity linker."""
    
    def __init__(self, gold_set_path: Path):
        """
        Initialize with gold set.
        
        Args:
            gold_set_path: Path to gold set JSON file
        """
        with open(gold_set_path, 'r') as f:
            self.gold_set = json.load(f)
        
        self.results = []
        self.metrics = {
            'true_positives': 0,
            'false_positives': 0,
            'false_negatives': 0,
            'true_negatives': 0,
            'brier_scores': [],
        }
    
    def run(self, linker: NLPLinker) -> dict:
        """
        Run calibration on gold set.
        
        Args:
            linker: NLP linker instance
            
        Returns:
            Metrics dict
        """
        print("=" * 80)
        print("NLP Linker Calibration")
        print(f"Gold set: {len(self.gold_set['test_cases'])} test cases")
        print("=" * 80)
        print()
        
        for test_case in self.gold_set['test_cases']:
            result = self._evaluate_test_case(linker, test_case)
            self.results.append(result)
            
            # Update metrics
            if result['correct']:
                if result['expected_match']:
                    self.metrics['true_positives'] += 1
                else:
                    self.metrics['true_negatives'] += 1
            else:
                if result['expected_match']:
                    self.metrics['false_negatives'] += 1
                else:
                    self.metrics['false_positives'] += 1
            
            # Brier score (for confidence calibration)
            if 'brier_score' in result:
                self.metrics['brier_scores'].append(result['brier_score'])
        
        # Compute aggregate metrics
        metrics = self._compute_metrics()
        
        # Print results
        self._print_results(metrics)
        
        return metrics
    
    def _evaluate_test_case(self, linker: NLPLinker, test_case: dict) -> dict:
        """
        Evaluate a single test case.
        
        Args:
            linker: NLP linker instance
            test_case: Test case dict
            
        Returns:
            Result dict
        """
        test_id = test_case['id']
        text = test_case['text']
        expected_syn_id = test_case.get('expected_syn_id')
        expected_name = test_case.get('expected_name')
        expected_type = test_case.get('expected_type')
        expected_confidence = test_case.get('expected_confidence')
        expected_confidence_min = test_case.get('expected_confidence_min')
        expected_confidence_max = test_case.get('expected_confidence_max')
        category = test_case.get('category', 'unknown')
        
        # Resolve
        best, all_candidates = linker.resolve(text)
        
        # Determine if match was expected
        expected_match = expected_syn_id is not None
        
        # Check correctness
        if expected_match:
            # Should resolve
            if best is None:
                # False negative
                correct = False
                error = "Failed to resolve (quarantined)"
            elif expected_name and best.canonical_name != expected_name:
                # Wrong entity
                correct = False
                error = f"Resolved to wrong entity: {best.canonical_name}"
            elif expected_type and best.entity_type != expected_type:
                # Wrong type
                correct = False
                error = f"Resolved to wrong type: {best.entity_type}"
            elif expected_confidence and abs(best.confidence - expected_confidence) > 0.05:
                # Confidence mismatch
                correct = False
                error = f"Confidence mismatch: {best.confidence} vs {expected_confidence}"
            elif expected_confidence_min and best.confidence < expected_confidence_min:
                # Confidence too low
                correct = False
                error = f"Confidence too low: {best.confidence} < {expected_confidence_min}"
            else:
                # Correct
                correct = True
                error = None
        else:
            # Should NOT resolve
            if best is None:
                # Correct (true negative)
                correct = True
                error = None
            elif expected_confidence_max and best.confidence <= expected_confidence_max:
                # Correctly quarantined (confidence below max)
                correct = True
                error = None
            else:
                # False positive
                correct = False
                error = f"Incorrectly resolved to: {best.canonical_name}"
        
        # Compute Brier score (if applicable)
        brier_score = None
        if best and expected_match:
            # Brier score: (confidence - actual)^2
            # actual = 1 if correct, 0 if incorrect
            actual = 1.0 if correct else 0.0
            brier_score = (best.confidence - actual) ** 2
        
        result = {
            'test_id': test_id,
            'text': text,
            'category': category,
            'expected_match': expected_match,
            'resolved': best is not None,
            'correct': correct,
            'error': error,
            'syn_id': best.syn_id if best else None,
            'canonical_name': best.canonical_name if best else None,
            'confidence': best.confidence if best else 0.0,
            'num_candidates': len(all_candidates),
            'brier_score': brier_score,
        }
        
        # Print result
        status = "✓" if correct else "✗"
        color = "\033[92m" if correct else "\033[91m"
        reset = "\033[0m"
        print(f"{color}{status}{reset} [{test_id:2d}] {text:20s} -> {result['canonical_name'] or 'NONE':30s} ({result['confidence']:.2f})")
        
        return result
    
    def _compute_metrics(self) -> dict:
        """
        Compute aggregate metrics.
        
        Returns:
            Metrics dict
        """
        tp = self.metrics['true_positives']
        fp = self.metrics['false_positives']
        fn = self.metrics['false_negatives']
        tn = self.metrics['true_negatives']
        
        # Precision: TP / (TP + FP)
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        
        # Recall: TP / (TP + FN)
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        
        # F1: 2 * (precision * recall) / (precision + recall)
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        
        # Accuracy: (TP + TN) / total
        total = tp + fp + fn + tn
        accuracy = (tp + tn) / total if total > 0 else 0.0
        
        # Brier score: mean squared error of confidence
        brier_score = (
            sum(self.metrics['brier_scores']) / len(self.metrics['brier_scores'])
            if self.metrics['brier_scores']
            else 0.0
        )
        
        return {
            'precision': precision,
            'recall': recall,
            'f1': f1,
            'accuracy': accuracy,
            'brier_score': brier_score,
            'true_positives': tp,
            'false_positives': fp,
            'false_negatives': fn,
            'true_negatives': tn,
            'total_cases': total,
        }
    
    def _print_results(self, metrics: dict) -> None:
        """Print calibration results."""
        print()
        print("=" * 80)
        print("Calibration Results")
        print("=" * 80)
        print()
        print(f"Precision:  {metrics['precision']:.3f}")
        print(f"Recall:     {metrics['recall']:.3f}")
        print(f"F1 Score:   {metrics['f1']:.3f}")
        print(f"Accuracy:   {metrics['accuracy']:.3f}")
        print(f"Brier:      {metrics['brier_score']:.4f}")
        print()
        print(f"True Positives:  {metrics['true_positives']}")
        print(f"False Positives: {metrics['false_positives']}")
        print(f"False Negatives: {metrics['false_negatives']}")
        print(f"True Negatives:  {metrics['true_negatives']}")
        print()
        
        # Pass/fail criteria
        print("=" * 80)
        print("Quality Gates")
        print("=" * 80)
        
        gates = [
            ("Precision >= 0.95", metrics['precision'] >= 0.95),
            ("Recall >= 0.70", metrics['recall'] >= 0.70),
            ("Brier Score <= 0.10", metrics['brier_score'] <= 0.10),
        ]
        
        all_passed = True
        for gate, passed in gates:
            status = "✓ PASS" if passed else "✗ FAIL"
            color = "\033[92m" if passed else "\033[91m"
            reset = "\033[0m"
            print(f"{color}{status}{reset} {gate}")
            if not passed:
                all_passed = False
        
        print()
        if all_passed:
            print("\033[92m✓ All quality gates passed\033[0m")
        else:
            print("\033[91m✗ Some quality gates failed\033[0m")
        print()


def main():
    """Main entry point."""
    gold_set_path = Path(__file__).parent.parent.parent.parent / 'data' / 'ontology' / 'linker_gold_set.json'
    
    if not gold_set_path.exists():
        print(f"Error: Gold set not found: {gold_set_path}")
        sys.exit(1)
    
    try:
        with get_db_connection() as conn:
            linker = NLPLinker(conn)
            calibration = LinkerCalibration(gold_set_path)
            metrics = calibration.run(linker)
        
        # Exit with failure if quality gates not met
        if metrics['precision'] < 0.95 or metrics['recall'] < 0.70:
            sys.exit(1)
        
        sys.exit(0)
    
    except Exception as e:
        print(f"Fatal error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()

