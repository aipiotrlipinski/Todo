package pl.lipinski.plan;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PlanBarsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
