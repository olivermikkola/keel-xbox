# 1. Patch ggml/src/ggml-backend-dl.cpp for UWP AppContainer
file(READ "ggml/src/ggml-backend-dl.cpp" DL_SRC)

set(UWP_STUB "#include \"ggml-backend-dl.h\"

#if defined(_WIN32) && defined(WINAPI_FAMILY) && (WINAPI_FAMILY == WINAPI_FAMILY_APP)

dl_handle * dl_load_library(const fs::path & path) {
    (void) path;
    return nullptr;
}

void * dl_get_sym(dl_handle * handle, const char * name) {
    (void) handle;
    (void) name;
    return nullptr;
}

const char * dl_error() {
    return \"Dynamic backend loading is disabled in UWP AppContainer.\";
}

#elif defined(_WIN32)
")

string(REPLACE "#include \"ggml-backend-dl.h\"\n\n#ifdef _WIN32" "${UWP_STUB}" DL_PATCHED "${DL_SRC}")
string(REPLACE "#include \"ggml-backend-dl.h\"\r\n\r\n#ifdef _WIN32" "${UWP_STUB}" DL_PATCHED "${DL_PATCHED}")
file(WRITE "ggml/src/ggml-backend-dl.cpp" "${DL_PATCHED}")

# 2. Patch src/llama-mmap.cpp (from // llama_mmap onward) to disable desktop mmap/mlock/prefetch under WINAPI_FAMILY_APP
file(READ "src/llama-mmap.cpp" MMAP_SRC)
string(FIND "${MMAP_SRC}" "// llama_mmap" MMAP_SPLIT_POS)
if(MMAP_SPLIT_POS GREATER -1)
    string(SUBSTRING "${MMAP_SRC}" 0 ${MMAP_SPLIT_POS} MMAP_HEAD)
    string(SUBSTRING "${MMAP_SRC}" ${MMAP_SPLIT_POS} -1 MMAP_TAIL)

    set(MMAP_GUARD "// llama_mmap
#if defined(_WIN32) && !(defined(WINAPI_FAMILY) && (WINAPI_FAMILY == WINAPI_FAMILY_APP))
#define LLAMA_DESKTOP_WIN32 1
#endif
")
    string(REPLACE "// llama_mmap" "${MMAP_GUARD}" MMAP_TAIL "${MMAP_TAIL}")
    string(REPLACE "defined(_WIN32)" "defined(LLAMA_DESKTOP_WIN32)" MMAP_TAIL "${MMAP_TAIL}")
    string(REPLACE "#ifdef _WIN32" "#ifdef LLAMA_DESKTOP_WIN32" MMAP_TAIL "${MMAP_TAIL}")

    file(WRITE "src/llama-mmap.cpp" "${MMAP_HEAD}${MMAP_TAIL}")
endif()

message(STATUS "Patched ggml-backend-dl.cpp and llama-mmap.cpp for WindowsStore UWP AppContainer")
