// TwinDeck Classic Helper
//
// Ergänzt den Skin "TwinDeck Classic" um Funktionen, die ein Skin allein nicht
// auslösen kann:
//   - Pause/Stopp bremst den Titel wie einen Plattenspieler ab (engine.brake)
//   - Play lässt ihn langsam anlaufen (engine.softStart)
//   - FADE blendet mit der im Skin eingestellten Dauer (0–20 s) zum anderen Player
//   - Zurück springt erst zum Titelanfang und lädt erst dann den vorigen Titel
//
// Der Skin zeigt die Tasten dieses Helfers nur an, solange
// [Skin],twindeck_helper_active = 1 ist. Ohne Helfer verhalten sich die
// Tasten wie ohne Skript.

var TwinDeckHelper = {};

// Größer = schneller. 1 ist die Mixxx-Voreinstellung (Bremse ca. 3,3 s);
// 12 ergibt ca. 1,2 s. Mixxx rechnet Werte über 1 intern als 1 + (Wert - 1) / 10.
TwinDeckHelper.BRAKE_FACTOR = 12;
TwinDeckHelper.START_FACTOR = 12;
TwinDeckHelper.FADE_MAX_SECONDS = 20;
TwinDeckHelper.FADE_STEP_MS = 20;
// Bis zu dieser Position (Sekunden) gilt ein stehender Titel als "am Anfang"
TwinDeckHelper.PREV_AT_START_SECONDS = 0.5;

TwinDeckHelper.connections = [];
TwinDeckHelper.braking = [false, false, false];
TwinDeckHelper.fadeTimer = 0;
TwinDeckHelper.heartbeatTimer = 0;

TwinDeckHelper.group = function(deck) {
    return "[Channel" + deck + "]";
};

TwinDeckHelper.init = function() {
    // Die [Skin]-Controls entstehen erst, wenn der Skin geladen ist. Deshalb
    // regelmäßig prüfen und Verbindungen nachholen; das setzt auch nach einem
    // Skin-Wechsel das Aktiv-Flag wieder.
    TwinDeckHelper.heartbeatTimer = engine.beginTimer(1000, TwinDeckHelper.heartbeat);
    TwinDeckHelper.heartbeat();
};

TwinDeckHelper.shutdown = function() {
    if (TwinDeckHelper.fadeTimer) {
        engine.stopTimer(TwinDeckHelper.fadeTimer);
        TwinDeckHelper.fadeTimer = 0;
    }
    if (TwinDeckHelper.heartbeatTimer) {
        engine.stopTimer(TwinDeckHelper.heartbeatTimer);
        TwinDeckHelper.heartbeatTimer = 0;
    }
    engine.setValue("[Skin]", "twindeck_helper_active", 0);
};

TwinDeckHelper.heartbeat = function() {
    if (TwinDeckHelper.connections.length === 0) {
        TwinDeckHelper.connect();
    }
    if (TwinDeckHelper.connections.length > 0 &&
            engine.getValue("[Skin]", "twindeck_helper_active") !== 1) {
        engine.setValue("[Skin]", "twindeck_helper_active", 1);
        TwinDeckHelper.updateFadeSeconds();
    }
};

TwinDeckHelper.connect = function() {
    var probe = engine.makeConnection("[Skin]", "twindeck_fade", TwinDeckHelper.onFade);
    if (!probe) {
        return; // Skin noch nicht geladen
    }
    var conns = [probe];
    conns.push(engine.makeConnection("[Skin]", "twindeck_fade_time", TwinDeckHelper.updateFadeSeconds));
    [1, 2].forEach(function(deck) {
        conns.push(engine.makeConnection("[Skin]", "twindeck_play_" + deck, function(value) {
            if (value > 0) {
                TwinDeckHelper.onPlay(deck);
            }
        }));
        conns.push(engine.makeConnection("[Skin]", "twindeck_stop_" + deck, function(value) {
            if (value > 0) {
                TwinDeckHelper.onStop(deck);
            }
        }));
        conns.push(engine.makeConnection("[Skin]", "twindeck_prev_" + deck, function(value) {
            if (value > 0) {
                TwinDeckHelper.onPrev(deck);
            }
        }));
        // Bremse ist fertig, sobald Mixxx das Deck anhält
        conns.push(engine.makeConnection(TwinDeckHelper.group(deck), "play", function(value) {
            if (value === 0) {
                TwinDeckHelper.braking[deck] = false;
            }
        }));
    });
    TwinDeckHelper.connections = conns;
};

TwinDeckHelper.isRunning = function(deck) {
    return engine.getValue(TwinDeckHelper.group(deck), "play") > 0 &&
        !TwinDeckHelper.braking[deck];
};

TwinDeckHelper.brake = function(deck) {
    TwinDeckHelper.braking[deck] = true;
    engine.brake(deck, true, TwinDeckHelper.BRAKE_FACTOR);
};

TwinDeckHelper.start = function(deck) {
    TwinDeckHelper.braking[deck] = false;
    engine.softStart(deck, true, TwinDeckHelper.START_FACTOR);
};

// ▶❚❚: läuft -> abbremsen und an der Stelle stehen bleiben,
//      steht oder bremst gerade -> langsam anlaufen
TwinDeckHelper.onPlay = function(deck) {
    if (TwinDeckHelper.isRunning(deck)) {
        TwinDeckHelper.brake(deck);
    } else {
        TwinDeckHelper.start(deck);
    }
};

// ■: läuft -> abbremsen und an der Stelle stehen bleiben,
//    steht bereits -> wie bisher zum Anfang
TwinDeckHelper.onStop = function(deck) {
    var group = TwinDeckHelper.group(deck);
    if (TwinDeckHelper.isRunning(deck)) {
        TwinDeckHelper.brake(deck);
    } else if (engine.getValue(group, "play") === 0) {
        engine.setValue(group, "start_stop", 1);
        engine.setValue(group, "start_stop", 0);
    }
};

TwinDeckHelper.press = function(group, key) {
    engine.setValue(group, key, 1);
    engine.setValue(group, key, 0);
};

// |◀◀: läuft der Titel oder steht er mitten drin -> zum Titelanfang,
//      steht er schon am Anfang (oder ist der Player leer) -> vorigen Titel der
//      Liste laden. Einen laufenden Player lässt Mixxx in der Grundeinstellung
//      nicht neu beladen, deshalb dort immer nur zum Anfang.
TwinDeckHelper.onPrev = function(deck) {
    var group = TwinDeckHelper.group(deck);
    var seconds = engine.getValue(group, "playposition") * engine.getValue(group, "duration");
    if (engine.getValue(group, "play") > 0 ||
            seconds > TwinDeckHelper.PREV_AT_START_SECONDS) {
        TwinDeckHelper.press(group, "start");
    } else {
        TwinDeckHelper.press("[Playlist]", "SelectPrevTrack");
        TwinDeckHelper.press(group, "LoadSelectedTrack");
    }
};

TwinDeckHelper.fadeSeconds = function() {
    var param = engine.getParameter("[Skin]", "twindeck_fade_time");
    return Math.round(Math.max(0, Math.min(1, param)) * TwinDeckHelper.FADE_MAX_SECONDS);
};

TwinDeckHelper.updateFadeSeconds = function() {
    engine.setValue("[Skin]", "twindeck_fade_seconds", TwinDeckHelper.fadeSeconds());
};

// FADE: bei laufendem Automix übernimmt Mixxx (Auto DJ) die Überblendung,
// sonst blendet der Helfer in der eingestellten Zeit zum anderen Player.
TwinDeckHelper.onFade = function(value) {
    if (value <= 0) {
        return;
    }
    if (engine.getValue("[AutoDJ]", "enabled") > 0) {
        engine.setValue("[AutoDJ]", "fade_now", 1);
        engine.setValue("[AutoDJ]", "fade_now", 0);
        return;
    }
    if (TwinDeckHelper.fadeTimer) {
        return; // Überblendung läuft bereits
    }

    var from = engine.getValue("[Master]", "crossfader");
    // Player A liegt links (-1), Player B rechts (+1)
    var target = from <= 0 ? 2 : 1;
    var source = target === 2 ? 1 : 2;
    var to = target === 2 ? 1 : -1;

    if (engine.getValue(TwinDeckHelper.group(target), "play") === 0) {
        engine.setValue(TwinDeckHelper.group(target), "play", 1);
    }

    var seconds = TwinDeckHelper.fadeSeconds();
    var steps = Math.max(1, Math.round(seconds * 1000 / TwinDeckHelper.FADE_STEP_MS));
    var step = 0;
    var finish = function() {
        engine.setValue("[Master]", "crossfader", to);
        engine.setValue(TwinDeckHelper.group(source), "play", 0);
    };
    if (seconds === 0) {
        finish();
        return;
    }
    TwinDeckHelper.fadeTimer = engine.beginTimer(TwinDeckHelper.FADE_STEP_MS, function() {
        step++;
        if (step >= steps) {
            engine.stopTimer(TwinDeckHelper.fadeTimer);
            TwinDeckHelper.fadeTimer = 0;
            finish();
            return;
        }
        engine.setValue("[Master]", "crossfader", from + (to - from) * step / steps);
    });
};
