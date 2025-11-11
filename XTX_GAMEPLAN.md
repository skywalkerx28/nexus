Based on their public information and job descriptions, XTX Markets practices several advanced forms of machine learning. Their entire business is built on using ML to create "price forecasts" for tens of thousands of financial instruments.


Today, their methods are far more advanced and are built on three main pillars.

### 1. Deep Learning for Time-Series Forecasting

This is their core business: predicting short-term price movements.

* **What it is:** They use complex neural networks (including modern **deep learning architectures**) to analyze vast amounts of "time-series" data. This data includes every tick, trade, and order book change—billions of data points a day.
* **The Goal:** The models "sift through the noise" to find subtle, predictive patterns in the market data that no human could ever see. This is a massive-scale pattern recognition problem, perfectly suited for deep learning.

### 2. Natural Language Processing (NLP) & Generative AI

This is their new frontier for finding an edge ("alpha"). They are investing heavily in this area through their research division, **XTY Labs**.

* **What it is:** They use NLP and **Transformer models** (the same technology behind models like GPT) to analyze massive, unstructured text data in real-time.
* **The Goal:** To instantly quantify market sentiment by "reading" millions of news articles, social media posts, and financial reports. An AI that can read a company's earnings report and understand its sentiment in a microsecond has a significant trading advantage.

Using NLP and Generative AI to "read" text is a race. The goal is to find, understand, and act on text-based information *faster* and *more accurately* than any human or any competitor's algorithm.

This process can be broken down into three stages.

### 1. The Data Ingestion (The "Scraping")

First, XTX's systems must acquire the raw text data. This is a massive, real-time plumbing problem. Their systems are connected to thousands of sources, ingesting data in milliseconds:

* **News Feeds:** Direct, machine-readable data feeds from sources like Bloomberg, Reuters, and Dow Jones.
* **Social Media:** Licensed "firehose" data from platforms like X (formerly Twitter) and Reddit, allowing them to see all public posts.
* **Regulatory Filings:** Direct feeds from SEC (in the US) and other global regulators. This includes earnings reports (10-Ks, 10-Qs), insider trading reports, and other corporate filings.
* **Other Sources:** Public web scraping of millions of other sources, like political news sites, industry blogs, and shipping forums.

### 2. The Analysis (The "Understanding")

This is where the NLP and Generative AI models, built by teams at **XTY Labs**, do their work. They don't just "read" the text; they **transform unstructured text into structured numbers** that their trading models can use.

Here are the key tasks the models perform:

* **Sentiment Analysis:** This is the most basic task. Is this text positive, negative, or neutral?
    * *Simple:* "Apple new iPhone launch is a disaster" = **Negative (-0.9)**
    * *Advanced:* A large model can understand financial sarcasm or context. "The CEO's presentation was certainly... *ambitious*." A simple model might see "ambitious" as positive, but an advanced model, understanding the context, would flag it as negative.

* **Named Entity Recognition (NER):** The model identifies *what* the text is about.
    * *Text:* "A fire at an TSMC plant in Taiwan may impact chip supply for NVIDIA and Apple."
    * *Output:*
        * **Event:** Fire
        * **Companies:** TSMC (Negative), NVIDIA (Negative), Apple (Negative)
        * **Location:** Taiwan
        * **Topic:** Supply Chain

* **Topic Modeling & Summarization:** What is the key information?
    * *Text:* A 50-page, dense earnings report (a 10-K filing) is released by Tesla.
    * *Model Goal:* Don't just score the sentiment. A **Generative AI (Foundation Model)** can read the entire document in a fraction of a second and extract key, novel information.
    * *Output:*
        * "Production targets for Model 2 **missed** analyst consensus."
        * "New **delay** mentioned for Cybertruck deliveries."
        * "Raw material costs **increased 5%**" (a new fact not previously known).

### 3. The Execution (The "Trading Advantage")

The numerical scores from the analysis (e.g., `TSLA_Sentiment = -0.75`, `Topic = 'ProductionDelay'`) are fed as features into the main trading algorithms.

This gives XTX two critical advantages:

1.  **Speed (The "Alpha")**
    When a company releases its earnings, XTX's AI doesn't need to wait for a human analyst at a bank to read the report, write a summary, and send it to human traders.

    * **Human:** 20-30 minutes to read, understand, and decide.
    * **XTX Model:** 50-100 *milliseconds* to ingest, analyze, and execute a trade.

    In that 20-minute gap, the model can trade on the "new" information before the rest of the market has even finished reading the first page.

2.  **Breadth (The "Edge")**
    A human trader can maybe track 20-30 companies in depth. XTX's models are doing this for **all 50,000 instruments they trade** simultaneously, 24/7. They can find subtle, predictive relationships that no human could ever find.

    * *Example:* A model might find that a cluster of negative news articles about a small, obscure shipping company in Singapore is a 30-minute leading predictor of a small drop in the price of crude oil.

This is the frontier. XTX is investing in its own AI labs (XTY Labs) because commercial, off-the-shelf models aren't good enough. They are building **proprietary foundation models** specifically trained on financial data and jargon to get a faster, more accurate "understanding" than anyone else—where a 1% better understanding or a 10-millisecond speed advantage can be worth millions.

### 3. Reinforcement Learning (RL)

This is a highly probable area of their research, as it's a key technique in modern quantitative finance.

* **What it is:** Instead of just forecasting prices, RL models are "agents" that learn by "playing" the market.
* **The Goal:** The model learns an optimal *trading strategy* by being rewarded for profitable actions and penalized for losses. This is useful for high-level problems like managing risk or optimizing how to execute a large order without moving the price.

To make this all possible, XTX has built one of the world's largest private AI infrastructures, including tens of thousands of high-end GPUs and petabytes of data storage.


 -- How XTX Trades Fixed Income --
This is where it gets advanced. A firm like XTX is not a traditional investor. They are not buying a bond to hold it for 10 years to collect the 5% coupon.

Instead, XTX is a quantitative market maker. Their goal is to make a tiny profit, millions of times a day, on the tiny price movements of those bonds.

Here is how they use their machine learning and speed to do it:

They Trade the "Spread": XTX provides liquidity to the market. They will simultaneously offer to buy a specific Apple bond for $999.98 (the "bid") and sell it for $1,000.02 (the "ask"). When they successfully buy and sell, they capture the $0.04 "spread."

Price Forecasting is Key: Their "secret sauce" is their machine learning models that are constantly forecasting the price of thousands of bonds for the next few seconds or minutes.

The Data They Use: Their models ingest massive amounts of data in real-time to make these predictions:

Market Data: This is exactly the TRACE data from your image. It's the real-time "tape" of all bond trades. Their models analyze this flow for patterns, volume, and momentum.

Interest Rate Futures: The price of all bonds is fundamentally linked to the "risk-free" interest rate set by the government (like US Treasuries). XTX's models watch these rates with microsecond-level precision. If the government rate ticks up, their models instantly re-price all corporate bonds.

Cross-Asset Signals: This is their biggest edge. The health of a company's stock is a real-time signal about the riskiness of its bonds. If Apple's stock suddenly drops, XTX's models will instantly widen their "ask" price for Apple's bonds, anticipating that the bond is now riskier.

News & Sentiment: Their NLP models "read" news feeds. If a positive earnings report is released, the models will adjust their bond price forecasts upwards before most human traders have finished reading the headline.

In short, XTX isn't "investing" in fixed income. They are a high-speed, data-driven middleman that uses AI to predict very short-term price movements and get paid for providing liquidity to the market.


-- Trading commodities -- 

When you trade commodities like coffee, crude oil, or gold, you are almost never buying the physical item. You're not going to get a barrel of oil or a bar of gold delivered to your house.

Instead, you are trading futures contracts.

What is a Futures Contract?
A futures contract is an agreement to buy or sell a specific amount of a commodity at a set price on a future date.

The Goal: Most traders are just speculating on the price. They will buy a futures contract hoping the price of that commodity (e.g., corn) goes up. They then sell the contract for a profit before the expiration date. They never own the physical corn.

The "How": This is all done on specialized exchanges, like the CME (Chicago Mercantile Exchange) or COMEX (mentioned in your screenshot for Gold).

How Firms Like XTX Trade Them
A high-frequency firm like XTX trades these futures contracts in the same way it trades stocks:

Data-Driven: They use their machine learning models to forecast the price of a corn futures contract for the next few seconds or minutes.

Speed: They execute thousands of trades per day, aiming to make a tiny profit on each trade by predicting the short-term direction of the price.

Data Sources: Their models would analyze data like:

Weather reports (which affect crops like corn and coffee)

Geopolitical news (which affects crude oil)

Shipping and supply chain data

The "order book" for the futures contracts themselves