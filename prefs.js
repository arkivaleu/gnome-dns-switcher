/*
 * DNS Switcher Extension
 * Copyright (C) 2026 Vadym Pakhomov <vadym.pakhomov@arkival.eu>
 * Licensed under the GNU GPLv3
 */

import Gio from 'gi://Gio';
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import GLib from 'gi://GLib';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), "dns-switcher"]);
const CONFIG_PATH = GLib.build_filenamev([CONFIG_DIR, "profiles.json"]);

export default class DNSSwitcherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'DNS Profiles',
            description: 'Format: {"Profile Name": ["8.8.8.8", "1.1.1.1"]}'
        });

        // For simplicity in this script, we'll use a TextView to edit the JSON directly.
        // It's the "Admin way" - fast and allows bulk copy-paste.
        const scrolled = new Gtk.ScrolledWindow({
            propagate_natural_height: true,
            min_content_height: 300,
            has_frame: true
        });

        const textView = new Gtk.TextView({
            monospace: true,
            left_margin: 10,
            right_margin: 10,
            top_margin: 10,
            bottom_margin: 10
        });

        // Load existing config
        let currentConfig = "{}";
        if (GLib.file_test(CONFIG_PATH, GLib.FileTest.EXISTS)) {
            const [ok, contents] = GLib.file_get_contents(CONFIG_PATH);
            if (ok) currentConfig = new TextDecoder().decode(contents);
        }
        
        textView.get_buffer().set_text(currentConfig, -1);

        // Save on change
        textView.get_buffer().connect('changed', (buffer) => {
            const text = buffer.get_text(buffer.get_start_iter(), buffer.get_end_iter(), false);
            try {
                JSON.parse(text); // Validate JSON
                if (!GLib.file_test(CONFIG_DIR, GLib.FileTest.EXISTS)) {
                    GLib.mkdir_with_parents(CONFIG_DIR, 0o755);
                }
                GLib.file_set_contents(CONFIG_PATH, text);
            } catch (e) {
                // Invalid JSON, don't save yet
            }
        });

        scrolled.set_child(textView);
        group.add(scrolled);
        page.add(group);
        window.add(page);
    }
}