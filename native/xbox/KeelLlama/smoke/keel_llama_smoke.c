/*
 * Smoke test for KeelLlama: drives the exact C API the Xbox app calls through
 * KeelLlamaInterop.cs (load -> chat_stream with callbacks -> unload) on a real
 * GGUF, and prints tokens/sec. Exit code 0 only if real text came back.
 *
 *   keel_llama_smoke <model.gguf> [prompt]
 */
#include "../keel_llama.h"

#include <stdio.h>
#include <string.h>
#include <time.h>

typedef struct {
    int pieces;
    size_t bytes;
} smoke_state;

static void KEEL_CALL on_token(const char * piece, void * user_data) {
    smoke_state * st = (smoke_state *) user_data;
    st->pieces += 1;
    st->bytes += strlen(piece);
    fputs(piece, stdout);
    fflush(stdout);
}

static int32_t KEEL_CALL never_cancel(void * user_data) {
    (void) user_data;
    return 0;
}

static double now_s(void) {
    struct timespec ts;
    timespec_get(&ts, TIME_UTC);
    return (double) ts.tv_sec + (double) ts.tv_nsec / 1e9;
}

int main(int argc, char ** argv) {
    if (argc < 2) {
        fprintf(stderr, "usage: %s <model.gguf> [prompt]\n", argv[0]);
        return 2;
    }
    const char * prompt = argc > 2 ? argv[2] : "In one sentence, what is an Xbox?";
    char err[512] = {0};

    double t0 = now_s();
    if (keel_llama_load(argv[1], 2048, 6, err, (int32_t) sizeof(err)) != 0) {
        fprintf(stderr, "load failed: %s\n", err);
        return 1;
    }
    double t_load = now_s() - t0;
    if (keel_llama_is_loaded() != 1) {
        fprintf(stderr, "is_loaded returned false after load\n");
        return 1;
    }

    const char * roles[] = {"system", "user"};
    const char * contents[] = {"You are Keel, a concise assistant on a TV.", prompt};
    smoke_state st = {0, 0};

    printf("--- reply ---\n");
    double t1 = now_s();
    int32_t rc = keel_llama_chat_stream(
        roles, contents, 2, 0.6f, 96, on_token, never_cancel, &st, err, (int32_t) sizeof(err));
    double t_gen = now_s() - t1;
    printf("\n--- end ---\n");

    keel_llama_unload();
    if (rc != 0) {
        fprintf(stderr, "chat_stream failed (%d): %s\n", rc, err);
        return 1;
    }
    printf("load %.2fs, %d tokens in %.2fs (%.1f tok/s incl. prefill), %zu bytes\n",
        t_load, st.pieces, t_gen, t_gen > 0 ? st.pieces / t_gen : 0.0, st.bytes);
    if (st.pieces < 3 || st.bytes < 8) {
        fprintf(stderr, "model produced too little text\n");
        return 1;
    }
    return 0;
}
