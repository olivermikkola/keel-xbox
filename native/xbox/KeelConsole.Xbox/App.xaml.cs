using System;
using Windows.ApplicationModel.Activation;
using Windows.System.Profile;
using Windows.UI.ViewManagement;
using Windows.UI.Xaml;
using Windows.UI.Xaml.Controls;

namespace KeelConsole.Xbox
{
    public sealed partial class App : Application
    {
        public App()
        {
            InitializeComponent();
            // Keep Xbox controller in true D-pad XY navigation instead of mouse cursor emulation
            RequiresPointerMode = ApplicationRequiresPointerMode.WhenRequested;
        }

        protected override void OnLaunched(LaunchActivatedEventArgs e)
        {
            if (AnalyticsInfo.VersionInfo.DeviceFamily == "Windows.Xbox")
            {
                // Disable default 200% UWP Xbox scaling so 10-foot UI renders crisp at 1080p/4K
                ApplicationViewScaling.TrySetDisableLayoutScaling(true);
                ApplicationView.GetForCurrentView().SetDesiredBoundsMode(
                    ApplicationViewBoundsMode.UseCoreWindow);
            }

            if (!(Window.Current.Content is Frame rootFrame))
            {
                rootFrame = new Frame();
                Window.Current.Content = rootFrame;
            }

            if (rootFrame.Content == null)
            {
                rootFrame.Navigate(typeof(MainPage), e.Arguments);
            }

            Window.Current.Activate();
        }
    }
}
