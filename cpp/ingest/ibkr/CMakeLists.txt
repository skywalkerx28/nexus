# IBKR Feed Adapter
add_library(nexus_ibkr STATIC
  src/feed_adapter.cpp
)

target_include_directories(nexus_ibkr PUBLIC
  ${CMAKE_CURRENT_SOURCE_DIR}/include
)

target_link_libraries(nexus_ibkr PUBLIC
  nexus_eventlog
  nexus_time
)

# Main executable for standalone ingestion
add_executable(nexus_ingest
  src/main.cpp
)

target_link_libraries(nexus_ingest PRIVATE
  nexus_ibkr
)

# Verification utility
add_executable(nexus_verify
  ${CMAKE_SOURCE_DIR}/scripts/verify_data.cpp
)

target_link_libraries(nexus_verify PRIVATE
  nexus_eventlog
)

