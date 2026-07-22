package com.bradleys.darksector;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Toast;

public final class MainActivity extends Activity {
    private static final Uri GAME_URI =
            Uri.parse("https://bradleys-dark-sector.vercel.app");
    private static final String QUEST_BROWSER_PACKAGE = "com.oculus.browser";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        openInQuestBrowser();
    }

    private void openInQuestBrowser() {
        Intent questBrowser = browserIntent();
        questBrowser.setPackage(QUEST_BROWSER_PACKAGE);
        try {
            startActivity(questBrowser);
        } catch (ActivityNotFoundException missingQuestBrowser) {
            try {
                startActivity(browserIntent());
            } catch (ActivityNotFoundException missingBrowser) {
                Toast.makeText(
                        this,
                        R.string.browser_missing,
                        Toast.LENGTH_LONG
                ).show();
            }
        } finally {
            finish();
        }
    }

    private Intent browserIntent() {
        Intent intent = new Intent(Intent.ACTION_VIEW, GAME_URI);
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }
}
