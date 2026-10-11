package com.dirtdj.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

@CapacitorPlugin(name = "AudioAccess", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class AudioAccessPlugin extends Plugin {
    // checkPermissions/requestPermissions use Capacitor's standard runtime flow.
    @PluginMethod
    public void openSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName())));
            call.resolve();
        } catch (Exception error) {
            call.reject("Could not open app settings", error);
        }
    }
}
