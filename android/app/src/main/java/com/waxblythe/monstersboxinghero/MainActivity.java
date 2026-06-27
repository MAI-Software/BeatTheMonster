package com.waxblythe.monstersboxinghero;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The camera permission is requested by NativePosePlugin via Capacitor (which delivers a
        // result and rejects on denial). No bare ActivityCompat request here — it had no result
        // handler and raced the plugin's own request.
        registerPlugin(NativePosePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
