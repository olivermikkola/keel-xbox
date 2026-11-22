using System;
using System.IO;
using System.Threading.Tasks;
using KeelConsole.Xbox.Services;
using Microsoft.Web.WebView2.Core;
using Windows.ApplicationModel;
using Windows.UI.Xaml.Controls;

namespace KeelConsole.Xbox
{
    public sealed partial class MainPage : Page
    {
        private readonly KeelNativeBridge _bridge = new KeelNativeBridge();

        public MainPage()
        {
            InitializeComponent();
            Loaded += OnLoaded;
        }

        private async void OnLoaded(object sender, Windows.UI.Xaml.RoutedEventArgs e)
        {
            await InitializeWebViewAsync();
        }

        private async Task InitializeWebViewAsync()
        {
            await ConsoleWebView.EnsureCoreWebView2Async();
            var core = ConsoleWebView.CoreWebView2;

            core.Settings.IsStatusBarEnabled = false;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.Settings.AreDevToolsEnabled = false;

            _bridge.AttachWebView(core);
            // Tell the UI it is running inside the packaged UWP/Xbox shell before any page script runs.
            await core.AddScriptToExecuteOnDocumentCreatedAsync("window.__keelUwpHost = 1;");

            // Prefer packaged static web export (Assets\ui) when bundled for Store/Dev Mode;
            // fall back to local dev server when iterating on UI from a dev host.
            string packagedUiDir = Path.Combine(Package.Current.InstalledLocation.Path, "ui");
            if (Directory.Exists(packagedUiDir))
            {
                core.SetVirtualHostNameToFolderMapping(
                    "keel.local",
                    packagedUiDir,
                    CoreWebView2HostResourceAccessKind.Allow);
                ConsoleWebView.Source = new Uri("https://keel.local/index.html");
            }
            else
            {
                ConsoleWebView.Source = new Uri("http://127.0.0.1:3847");
            }
        }
    }
}
