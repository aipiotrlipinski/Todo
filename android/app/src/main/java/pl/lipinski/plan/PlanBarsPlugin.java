package pl.lipinski.plan;

import android.view.Window;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Tells the page how tall the status bar and navigation bar are (in CSS px),
 * and lets the page switch status bar icons between light and dark.
 */
@CapacitorPlugin(name = "PlanBars")
public class PlanBarsPlugin extends Plugin {
    private float top = 0f;
    private float bottom = 0f;

    @Override
    public void load() {
        WebView web = getBridge().getWebView();
        ViewCompat.setOnApplyWindowInsetsListener(web, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            float d = v.getResources().getDisplayMetrics().density;
            top = bars.top / d;
            bottom = bars.bottom / d;
            notifyListeners("insets", data(), true);
            return ViewCompat.onApplyWindowInsets(v, insets);
        });
        ViewCompat.requestApplyInsets(web);
    }

    private JSObject data() {
        JSObject o = new JSObject();
        o.put("top", top);
        o.put("bottom", bottom);
        return o;
    }

    @PluginMethod
    public void getInsets(PluginCall call) {
        call.resolve(data());
    }

    @PluginMethod
    public void setStyle(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", true));
        getActivity().runOnUiThread(() -> {
            Window w = getActivity().getWindow();
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(!dark);
            c.setAppearanceLightNavigationBars(!dark);
        });
        call.resolve();
    }
}
