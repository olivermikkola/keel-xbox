#pragma once

#include <stdint.h>

#ifdef _WIN32
  #ifdef KEEL_LLAMA_EXPORTS
    #define KEEL_API __declspec(dllexport)
  #else
    #define KEEL_API __declspec(dllimport)
  #endif
  #define KEEL_CALL __stdcall
#else
  #define KEEL_API
  #define KEEL_CALL
#endif

#ifdef __cplusplus
extern "C" {
#endif

typedef void (KEEL_CALL * keel_token_cb)(const char * utf8_piece, void * user_data);
typedef int32_t (KEEL_CALL * keel_cancel_cb)(void * user_data);

KEEL_API int32_t KEEL_CALL keel_llama_load(
    const char * model_path_utf8,
    int32_t n_ctx,
    int32_t n_threads,
    char * err_buf,
    int32_t err_cap);

KEEL_API void KEEL_CALL keel_llama_unload(void);
KEEL_API int32_t KEEL_CALL keel_llama_is_loaded(void);

KEEL_API int32_t KEEL_CALL keel_llama_chat_stream(
    const char ** roles,
    const char ** contents,
    int32_t message_count,
    float temperature,
    int32_t max_tokens,
    keel_token_cb on_token,
    keel_cancel_cb is_cancelled,
    void * user_data,
    char * err_buf,
    int32_t err_cap);

#ifdef __cplusplus
}
#endif
