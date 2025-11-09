add_library(nexus_eventlog STATIC
    src/schema.cpp
    src/arrow_schema.cpp
    src/metadata.cpp
    src/partitioner.cpp
    src/validator.cpp
    src/writer.cpp
    src/reader.cpp
)

# Find Arrow and Parquet
find_package(Arrow REQUIRED)
find_package(Parquet REQUIRED)

target_include_directories(nexus_eventlog
    PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE ${ARROW_INCLUDE_DIR}
)

target_link_libraries(nexus_eventlog
    PUBLIC nexus_time
    PRIVATE Arrow::arrow_shared Parquet::parquet_shared
)

# Python bindings
pybind11_add_module(eventlog_py src/bindings.cpp)
target_link_libraries(eventlog_py PRIVATE nexus_eventlog)

# Tests
add_executable(eventlog_test 
    test/eventlog_test.cpp
    test/validation_test.cpp
    test/partitioner_test.cpp
)
target_link_libraries(eventlog_test PRIVATE nexus_eventlog GTest::gtest_main)
add_test(NAME EventLogTest COMMAND eventlog_test)

add_executable(replay_parity_test test/replay_parity_test.cpp)
target_link_libraries(replay_parity_test PRIVATE nexus_eventlog GTest::gtest_main)
add_test(NAME ReplayParityTest COMMAND replay_parity_test)

add_executable(large_file_test test/large_file_test.cpp)
target_link_libraries(large_file_test PRIVATE nexus_eventlog GTest::gtest_main)
add_test(NAME LargeFileTest COMMAND large_file_test)

