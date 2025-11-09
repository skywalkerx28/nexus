add_library(nexus_eventlog STATIC
    src/schema.cpp
    src/writer.cpp
    src/reader.cpp
)

target_include_directories(nexus_eventlog
    PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include
    PRIVATE ${ARROW_INCLUDE_DIRS}
)

target_link_libraries(nexus_eventlog
    PUBLIC nexus_time
    PRIVATE ${ARROW_LIBRARIES}
)

# Python bindings
pybind11_add_module(eventlog_py src/bindings.cpp)
target_link_libraries(eventlog_py PRIVATE nexus_eventlog)

# Tests
add_executable(eventlog_test test/eventlog_test.cpp)
target_link_libraries(eventlog_test PRIVATE nexus_eventlog GTest::gtest_main)
add_test(NAME EventLogTest COMMAND eventlog_test)

