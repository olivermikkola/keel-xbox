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
message(STATUS "Patched ggml-backend-dl.cpp for WindowsStore UWP AppContainer")
