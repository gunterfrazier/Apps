package com.ourfaithfulchurch.screens;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * After a power cut or restart, open the screen again so the lobby doesn't sit on the TV's home screen.
 * Android TV boxes allow this. Google TV (Android 10 and later) only lets an app open itself from the background if
 * it may "Display over other apps"; see README.md for turning that on, or use the TV's own "start this app" setting.
 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        try { context.startActivity(open); } catch (RuntimeException ignored) { /* not allowed on this TV: see README */ }
    }
}
