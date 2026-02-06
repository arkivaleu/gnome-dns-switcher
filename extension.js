/*
 * DNS Switcher Extension
 * Copyright (C) 2026 Vadym Pakhomov <vadym.pakhomov@arkival.eu>
 * Licensed under the GNU GPLv3
 */

// ----------------------------
// Imports (GJS ESM Style)
// ----------------------------
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

// Extension base
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

// UI Components
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

// ----------------------------
// Constants
// ----------------------------
const CONFIG_DIR = GLib.build_filenamev([GLib.get_user_config_dir(), "dns-switcher"]);
const CONFIG_PATH = GLib.build_filenamev([CONFIG_DIR, "profiles.json"]);

// ----------------------------
// Extension Class
// ----------------------------
export default class DNSSwitcherExtension extends Extension {
    enable() {
        this._button = null;
        this._profiles = {};
        this._monitor = null;

        // 1. Initialize the Panel Button
        this._button = new PanelMenu.Button(0.0, "DNS Switcher");
        const icon = new St.Icon({
            icon_name: 'network-workgroup-symbolic',
            style_class: 'system-status-icon'
        });
        this._button.add_child(icon);

        // 2. Setup File Monitoring (Auto-refresh on config change)
        this._setupFileMonitor();

        // 3. Initial Load & Build
        this._loadProfiles();
        this._buildMenu();

        // 4. Add to Panel
        Main.panel.addToStatusArea(this.uuid, this._button, 1, "right");
    }

    disable() {
        if (this._monitor) {
            this._monitor.cancel();
            this._monitor = null;
        }
        if (this._button) {
            this._button.destroy();
            this._button = null;
        }
        this._profiles = null;
    }

    _setupFileMonitor() {
        try {
            const file = Gio.File.new_for_path(CONFIG_PATH);
            // Ensure dir exists so monitor doesn't fail
            if (!GLib.file_test(CONFIG_DIR, GLib.FileTest.EXISTS)) {
                GLib.mkdir_with_parents(CONFIG_DIR, 0o755);
            }
            
            this._monitor = file.monitor_file(Gio.FileMonitorFlags.NONE, null);
            this._monitor.connect('changed', (mon, file, other, eventType) => {
                // Refresh on changes or creation
                if (eventType === Gio.FileMonitorEvent.CHANGES_DONE_HINT || 
                    eventType === Gio.FileMonitorEvent.CREATED) {
                    this._loadProfiles();
                    this._buildMenu();
                }
            });
        } catch (e) {
            console.error(`DNS Switcher: Monitor failed: ${e}`);
        }
    }

    _loadProfiles() {
        try {
            const file = Gio.File.new_for_path(CONFIG_PATH);
            if (!file.query_exists(null)) {
                this._profiles = {};
                return;
            }

            const [ok, contents] = file.load_contents(null);
            if (!ok) return;

            const decoder = new TextDecoder('utf-8');
            const text = decoder.decode(contents);
            this._profiles = JSON.parse(text);
        } catch (e) {
            console.error(`DNS Switcher: Load error: ${e}`);
            this._profiles = {};
        }
    }

    _buildMenu() {
        this._button.menu.removeAll();

        const entries = Object.entries(this._profiles);
        if (entries.length === 0) {
            const item = new PopupMenu.PopupMenuItem("No Profiles (Check Prefs)");
            item.setSensitive(false);
            this._button.menu.addMenuItem(item);
            return;
        }

        for (const [name, servers] of entries) {
            const item = new PopupMenu.PopupMenuItem(name);
            item.connect('activate', () => this._applyDNS(servers));
            this._button.menu.addMenuItem(item);
        }

        // Add a separator and settings shortcut
        this._button.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        const settingsItem = new PopupMenu.PopupMenuItem("Configure...");
        settingsItem.connect('activate', () => {
            GLib.spawn_command_line_async('gnome-extensions prefs ' + this.uuid);
        });
        this._button.menu.addMenuItem(settingsItem);
    }

    _applyDNS(servers) {
        if (!Array.isArray(servers) || servers.length === 0) return;

        const dnsString = servers.join(",");
        
        try {
            // Get active connection names (Admin's awk approach simplified)
            const [ok, out] = GLib.spawn_command_line_sync(
                `nmcli -t -f NAME,TYPE connection show --active`
            );

            if (!ok || !out) return;

            const decoder = new TextDecoder('utf-8');
            const lines = decoder.decode(out).split('\n');

            for (const line of lines) {
                const [name, type] = line.split(':');
                if (type === '802-11-wireless' || type === '802-3-ethernet') {
                    // Update DNS
                    GLib.spawn_command_line_async(`nmcli connection modify "${name}" ipv4.dns "${dnsString}" ipv4.ignore-auto-dns yes`);
                    // Apply changes
                    GLib.spawn_command_line_async(`nmcli connection up "${name}"`);
                }
            }
            
            Main.notify("DNS Switcher", `Applied DNS: ${dnsString}`);
        } catch (e) {
            console.error(`DNS Switcher: Apply error: ${e}`);
        }
    }
}