using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;

namespace KeelConsole.Xbox.Services
{
    /// <summary>
    /// P/Invoke bindings to native UWP-compiled <c>KeelLlama.dll</c> (llama.cpp).
    /// </summary>
    internal static class KeelLlamaInterop
    {
        private const string DllName = "KeelLlama.dll";

        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        public delegate void TokenCallback(IntPtr utf8Piece, IntPtr userData);

        [UnmanagedFunctionPointer(CallingConvention.StdCall)]
        public delegate int CancelCallback(IntPtr userData);

        [DllImport(DllName, CallingConvention = CallingConvention.StdCall)]
        private static extern int keel_llama_load(
            IntPtr modelPathUtf8,
            int nCtx,
            int nThreads,
            byte[] errBuf,
            int errCap);

        [DllImport(DllName, CallingConvention = CallingConvention.StdCall)]
        private static extern void keel_llama_unload();

        [DllImport(DllName, CallingConvention = CallingConvention.StdCall)]
        private static extern int keel_llama_is_loaded();

        [DllImport(DllName, CallingConvention = CallingConvention.StdCall)]
        private static extern int keel_llama_chat_stream(
            IntPtr[] roles,
            IntPtr[] contents,
            int messageCount,
            float temperature,
            int maxTokens,
            TokenCallback onToken,
            CancelCallback isCancelled,
            IntPtr userData,
            byte[] errBuf,
            int errCap);

        public static bool IsNativeLibraryAvailable()
        {
            try
            {
                _ = keel_llama_is_loaded();
                return true;
            }
            catch (DllNotFoundException)
            {
                return false;
            }
            catch (EntryPointNotFoundException)
            {
                return false;
            }
        }

        public static void LoadModel(string modelPath, int nCtx = 2048, int nThreads = 6)
        {
            byte[] err = new byte[512];
            IntPtr pathPtr = AllocUtf8(modelPath);
            try
            {
                int rc = keel_llama_load(pathPtr, nCtx, nThreads, err, err.Length);
                if (rc != 0)
                {
                    throw new InvalidOperationException(DecodeNullTerminatedUtf8(err));
                }
            }
            finally
            {
                Marshal.FreeHGlobal(pathPtr);
            }
        }

        public static void Unload()
        {
            try
            {
                keel_llama_unload();
            }
            catch (DllNotFoundException)
            {
            }
        }

        public static void StreamChat(
            IReadOnlyList<(string Role, string Content)> messages,
            float temperature,
            int maxTokens,
            Action<string> onToken,
            CancellationToken ct)
        {
            int count = messages.Count;
            IntPtr[] rolePtrs = new IntPtr[count];
            IntPtr[] contentPtrs = new IntPtr[count];

            TokenCallback tokCb = (piecePtr, _) =>
            {
                string piece = ReadUtf8(piecePtr);
                if (!string.IsNullOrEmpty(piece))
                {
                    onToken(piece);
                }
            };

            CancelCallback cancelCb = _ => ct.IsCancellationRequested ? 1 : 0;

            byte[] err = new byte[512];
            try
            {
                for (int i = 0; i < count; i++)
                {
                    rolePtrs[i] = AllocUtf8(messages[i].Role);
                    contentPtrs[i] = AllocUtf8(messages[i].Content);
                }

                int rc = keel_llama_chat_stream(
                    rolePtrs,
                    contentPtrs,
                    count,
                    temperature,
                    maxTokens,
                    tokCb,
                    cancelCb,
                    IntPtr.Zero,
                    err,
                    err.Length);

                GC.KeepAlive(tokCb);
                GC.KeepAlive(cancelCb);

                if (rc != 0)
                {
                    throw new InvalidOperationException(DecodeNullTerminatedUtf8(err));
                }
            }
            finally
            {
                for (int i = 0; i < count; i++)
                {
                    if (rolePtrs[i] != IntPtr.Zero) Marshal.FreeHGlobal(rolePtrs[i]);
                    if (contentPtrs[i] != IntPtr.Zero) Marshal.FreeHGlobal(contentPtrs[i]);
                }
            }
        }

        private static IntPtr AllocUtf8(string value)
        {
            byte[] bytes = Encoding.UTF8.GetBytes(value ?? string.Empty);
            IntPtr ptr = Marshal.AllocHGlobal(bytes.Length + 1);
            Marshal.Copy(bytes, 0, ptr, bytes.Length);
            Marshal.WriteByte(ptr, bytes.Length, 0);
            return ptr;
        }

        private static string ReadUtf8(IntPtr ptr)
        {
            if (ptr == IntPtr.Zero) return string.Empty;
            int len = 0;
            while (Marshal.ReadByte(ptr, len) != 0) len++;
            if (len == 0) return string.Empty;
            byte[] buf = new byte[len];
            Marshal.Copy(ptr, buf, 0, len);
            return Encoding.UTF8.GetString(buf);
        }

        private static string DecodeNullTerminatedUtf8(byte[] buf)
        {
            int len = Array.IndexOf(buf, (byte)0);
            if (len < 0) len = buf.Length;
            string s = Encoding.UTF8.GetString(buf, 0, len).Trim();
            return string.IsNullOrEmpty(s) ? "Native xllama inference error." : s;
        }
    }
}
