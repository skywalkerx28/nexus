add_library(nexus_time STATIC src/time.cpp)
target_include_directories(nexus_time PUBLIC ${CMAKE_CURRENT_SOURCE_DIR}/include)

# Tests
add_executable(time_test test/time_test.cpp)
target_link_libraries(time_test PRIVATE nexus_time GTest::gtest_main)
add_test(NAME TimeTest COMMAND time_test)

