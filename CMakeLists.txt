cmake_minimum_required(VERSION 3.20)
project(nexus VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Compiler warnings
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    add_compile_options(-Wall -Wextra -Wpedantic -Werror)
endif()

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Optimization flags
set(CMAKE_CXX_FLAGS_RELEASE "-O3 -DNDEBUG -march=native")
set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -fsanitize=address,undefined")

# Find dependencies
find_package(Python3 COMPONENTS Interpreter Development REQUIRED)

# Include FetchContent for dependencies
include(FetchContent)

# Google Test
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)
FetchContent_MakeAvailable(googletest)

# pybind11
FetchContent_Declare(
    pybind11
    GIT_REPOSITORY https://github.com/pybind/pybind11.git
    GIT_TAG v2.11.1
)
FetchContent_MakeAvailable(pybind11)

# Apache Arrow (for Parquet)
find_package(Arrow QUIET)
if(NOT Arrow_FOUND)
    message(STATUS "Arrow not found, will use system installation")
    # Assume Arrow is installed via system package manager
    set(ARROW_INCLUDE_DIRS "/usr/local/include")
    set(ARROW_LIBRARIES arrow parquet)
endif()

# Enable testing
enable_testing()

# Add subdirectories
add_subdirectory(cpp/time)
add_subdirectory(cpp/eventlog)

# Summary
message(STATUS "Nexus Configuration:")
message(STATUS "  Build type: ${CMAKE_BUILD_TYPE}")
message(STATUS "  C++ standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "  Compiler: ${CMAKE_CXX_COMPILER_ID} ${CMAKE_CXX_COMPILER_VERSION}")

