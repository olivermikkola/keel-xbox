#include "keel_llama.h"
#include "llama.h"

#include <algorithm>
#include <cstdio>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>

namespace {

std::mutex g_mutex;
llama_model * g_model = nullptr;
llama_context * g_ctx = nullptr;
std::string g_loaded_path;
bool g_backend_ready = false;

void write_err(char * err_buf, int32_t err_cap, const std::string & msg) {
    if (!err_buf || err_cap <= 0) return;
    std::snprintf(err_buf, static_cast<size_t>(err_cap), "%s", msg.c_str());
}

void batch_set_tokens(
    llama_batch_ext * batch,
    const llama_token * tokens,
    int32_t n_tokens,
    llama_pos pos_0) {
    llama_batch_ext_clear(batch);
    for (int32_t i = 0; i < n_tokens; ++i) {
        const int32_t idx = llama_batch_ext_add_token(batch, 0, tokens[i]);
        const llama_pos pos = pos_0 + i;
        llama_batch_ext_set_pos(batch, idx, &pos);
    }
    llama_batch_ext_set_output_logits(batch, n_tokens - 1, true);
}

void free_locked() {
    if (g_ctx) {
        llama_free(g_ctx);
        g_ctx = nullptr;
    }
    if (g_model) {
        llama_model_free(g_model);
        g_model = nullptr;
    }
    g_loaded_path.clear();
}

}  // namespace

extern "C" {

KEEL_API int32_t KEEL_CALL keel_llama_load(
    const char * model_path_utf8,
    int32_t n_ctx,
    int32_t n_threads,
    char * err_buf,
    int32_t err_cap) {
    std::lock_guard<std::mutex> lock(g_mutex);

    if (!model_path_utf8 || !*model_path_utf8) {
        write_err(err_buf, err_cap, "Model path is empty.");
        return -1;
    }

    if (!g_backend_ready) {
        llama_log_set([](enum ggml_log_level, const char *, void *) {}, nullptr);
        llama_backend_init();
        g_backend_ready = true;
    }

    std::string target_path(model_path_utf8);
    if (g_model && g_ctx && g_loaded_path == target_path) {
        return 0;
    }

    free_locked();

    llama_model_params mparams = llama_model_default_params();
    mparams.n_gpu_layers = 0;
    // Standard heap read stays AppContainer/WACK-clean on Xbox UWP
    mparams.load_mode = LLAMA_LOAD_MODE_NONE;
    mparams.lazy_mode = LLAMA_LAZY_MODE_OFF;

    g_model = llama_model_load_from_file(target_path.c_str(), mparams);
    if (!g_model) {
        write_err(err_buf, err_cap, "Failed to load GGUF model from LocalState.");
        return -2;
    }

    llama_context_params cparams = llama_context_default_params();
    cparams.n_ctx = static_cast<uint32_t>(std::max<int32_t>(512, n_ctx));
    cparams.n_batch = std::min<uint32_t>(cparams.n_ctx, 512);
    if (n_threads > 0) {
        cparams.n_threads = n_threads;
        cparams.n_threads_batch = n_threads;
    }

    g_ctx = llama_init_from_model(g_model, cparams);
    if (!g_ctx) {
        free_locked();
        write_err(err_buf, err_cap, "Failed to allocate llama context.");
        return -3;
    }

    g_loaded_path = target_path;
    return 0;
}

KEEL_API void KEEL_CALL keel_llama_unload(void) {
    std::lock_guard<std::mutex> lock(g_mutex);
    free_locked();
}

KEEL_API int32_t KEEL_CALL keel_llama_is_loaded(void) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return (g_model != nullptr && g_ctx != nullptr) ? 1 : 0;
}

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
    int32_t err_cap) {
    std::lock_guard<std::mutex> lock(g_mutex);

    if (!g_model || !g_ctx) {
        write_err(err_buf, err_cap, "No GGUF model loaded.");
        return -1;
    }

    if (!roles || !contents || message_count <= 0) {
        write_err(err_buf, err_cap, "Messages array is empty.");
        return -2;
    }

    llama_memory_clear(llama_get_memory(g_ctx), true);

    std::vector<llama_chat_message> msgs;
    msgs.reserve(static_cast<size_t>(message_count));
    for (int32_t i = 0; i < message_count; ++i) {
        msgs.push_back({roles[i] ? roles[i] : "user", contents[i] ? contents[i] : ""});
    }

    const char * tmpl = llama_model_chat_template(g_model, nullptr);
    std::string prompt;
    if (tmpl && *tmpl) {
        std::vector<char> formatted(static_cast<size_t>(llama_n_ctx(g_ctx)) * 4);
        int len = llama_chat_apply_template(
            tmpl, msgs.data(), msgs.size(), true, formatted.data(), static_cast<int>(formatted.size()));
        if (len > static_cast<int>(formatted.size())) {
            formatted.resize(static_cast<size_t>(len));
            len = llama_chat_apply_template(
                tmpl, msgs.data(), msgs.size(), true, formatted.data(), static_cast<int>(formatted.size()));
        }
        if (len > 0) {
            prompt.assign(formatted.data(), static_cast<size_t>(len));
        }
    }
    if (prompt.empty()) {
        for (const auto & m : msgs) {
            prompt += "<|im_start|>";
            prompt += m.role;
            prompt += "\n";
            prompt += m.content;
            prompt += "<|im_end|>\n";
        }
        prompt += "<|im_start|>assistant\n";
    }

    const llama_vocab * vocab = llama_model_get_vocab(g_model);
    const int n_prompt = -llama_tokenize(
        vocab, prompt.c_str(), static_cast<int>(prompt.size()), nullptr, 0, true, true);
    if (n_prompt <= 0) {
        write_err(err_buf, err_cap, "Failed to tokenize prompt.");
        return -3;
    }

    std::vector<llama_token> prompt_tokens(static_cast<size_t>(n_prompt));
    if (llama_tokenize(
            vocab,
            prompt.c_str(),
            static_cast<int>(prompt.size()),
            prompt_tokens.data(),
            static_cast<int>(prompt_tokens.size()),
            true,
            true) < 0) {
        write_err(err_buf, err_cap, "Tokenization failed.");
        return -3;
    }

    llama_sampler * smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(smpl, llama_sampler_init_min_p(0.05f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(std::max(0.05f, temperature)));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(LLAMA_DEFAULT_SEED));

    llama_batch_ext * batch = llama_batch_ext_init(g_ctx);
    const int32_t limit = std::clamp<int32_t>(max_tokens, 16, 2048);
    const int32_t n_ctx_max = static_cast<int32_t>(llama_n_ctx(g_ctx));

    // Prefill in chunks <= n_batch
    const int32_t n_batch_max = static_cast<int32_t>(llama_n_batch(g_ctx));
    int32_t offset = 0;
    int32_t pos = 0;
    while (offset < static_cast<int32_t>(prompt_tokens.size())) {
        if (is_cancelled && is_cancelled(user_data)) {
            llama_batch_ext_free(batch);
            llama_sampler_free(smpl);
            return 0;
        }
        const int32_t chunk = std::min<int32_t>(
            n_batch_max, static_cast<int32_t>(prompt_tokens.size()) - offset);
        if (pos + chunk >= n_ctx_max) {
            llama_batch_ext_free(batch);
            llama_sampler_free(smpl);
            write_err(err_buf, err_cap, "Prompt exceeds context window.");
            return -4;
        }
        batch_set_tokens(batch, prompt_tokens.data() + offset, chunk, pos);
        if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, batch) != 0) {
            llama_batch_ext_free(batch);
            llama_sampler_free(smpl);
            write_err(err_buf, err_cap, "Prefill decode failed.");
            return -5;
        }
        offset += chunk;
        pos += chunk;
    }

    // Autoregressive decode loop
    for (int32_t step = 0; step < limit; ++step) {
        if (is_cancelled && is_cancelled(user_data)) {
            break;
        }
        if (pos + 1 >= n_ctx_max) {
            break;
        }

        const llama_token tok = llama_sampler_sample(smpl, g_ctx, -1);
        if (llama_vocab_is_eog(vocab, tok)) {
            break;
        }

        char piece[256];
        const int n = llama_token_to_piece(vocab, tok, piece, sizeof(piece) - 1, 0, true);
        if (n > 0) {
            piece[n] = '\0';
            if (on_token) {
                on_token(piece, user_data);
            }
        }

        batch_set_tokens(batch, &tok, 1, pos);
        if (llama_process(g_ctx, LLAMA_PROCESS_TYPE_DECODE, batch) != 0) {
            llama_batch_ext_free(batch);
            llama_sampler_free(smpl);
            write_err(err_buf, err_cap, "Token decode failed.");
            return -6;
        }
        pos += 1;
    }

    llama_batch_ext_free(batch);
    llama_sampler_free(smpl);
    return 0;
}

}  // extern "C"
