cmake_minimum_required(VERSION 3.22)
project(KeelLlama LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_SSE42 ON CACHE BOOL "" FORCE)
set(GGML_AVX ON CACHE BOOL "" FORCE)
set(GGML_AVX2 ON CACHE BOOL "" FORCE)
set(GGML_FMA ON CACHE BOOL "" FORCE)
set(GGML_F16C ON CACHE BOOL "" FORCE)

FetchContent_Declare(
  llama_cpp
  GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git
  GIT_TAG b12441
  GIT_SHALLOW TRUE
  PATCH_COMMAND ${CMAKE_COMMAND} -P ${CMAKE_CURRENT_SOURCE_DIR}/patch_uwp.cmake
)
FetchContent_MakeAvailable(llama_cpp)

add_library(KeelLlama SHARED
  keel_llama.h
  keel_llama.cpp
)

target_compile_definitions(KeelLlama PRIVATE KEEL_LLAMA_EXPORTS)
target_link_libraries(KeelLlama PRIVATE llama ggml)

if(MSVC AND CMAKE_SYSTEM_NAME STREQUAL "WindowsStore")
  target_link_options(KeelLlama PRIVATE /APPCONTAINER)
endif()

# Host smoke test (Linux/Windows desktop): same keel_llama API the Xbox app calls.
option(KEEL_LLAMA_SMOKE "Build the keel_llama_smoke host test" OFF)
if(KEEL_LLAMA_SMOKE)
  add_executable(keel_llama_smoke smoke/keel_llama_smoke.c)
  target_link_libraries(keel_llama_smoke PRIVATE KeelLlama)
endif()
