/* global $CC, Utils, $SD */

/**
 * The 'connected' event is sent to your plugin, after the plugin's instance
 * is registered with Stream Deck software. It carries the current websocket
 * and other information about the current environmet in a JSON object
 * You can use it to subscribe to events you want to use in your plugin.
 */

$SD.on('connected', (jsonObj) => connected(jsonObj));

function connected(jsn) {
    // Subscribe to the willAppear and other events
    $SD.on('com.nagopy.streamdeck.tasktimer.action.willAppear', (jsonObj) => action.onWillAppear(jsonObj));
    $SD.on('com.nagopy.streamdeck.tasktimer.action.keyDown', (jsonObj) => action.onKeyDown(jsonObj));
    $SD.on('com.nagopy.streamdeck.tasktimer.action.keyUp', (jsonObj) => action.onKeyUp(jsonObj));
    $SD.on('com.nagopy.streamdeck.tasktimer.action.didReceiveSettings', (jsonObj) => action.onDidReceiveSettings(jsonObj));
    $SD.on('com.nagopy.streamdeck.tasktimer.action.propertyInspectorDidAppear', (jsonObj) => {
        console.log('%c%s', 'color: white; background: black; font-size: 13px;', '[app.js]propertyInspectorDidAppear:');
    });
    $SD.on('com.nagopy.streamdeck.tasktimer.action.propertyInspectorDidDisappear', (jsonObj) => {
        console.log('%c%s', 'color: white; background: red; font-size: 13px;', '[app.js]propertyInspectorDidDisappear:');
    });
}

// ACTIONS

const action = {

    timers: {},
    onDidReceiveSettings: function (jsn) {
        console.log('[app.js]onDidReceiveSettings', jsn);

        this.timers[jsn.context].updateSettings(jsn.payload.settings)
    },

    onWillAppear: function (jsn) {
        console.log('onWillAppear', jsn.payload.settings);
        let ctx = jsn.context
        this.timers[ctx] = new Timer(jsn)
    },

    onKeyDown: function (jsn) {
        let ctx = jsn.context
        let timer = this.timers[ctx]
        timer.keyDownMs = new Date().getTime()
    },

    onKeyUp: function (jsn) {
        const ctx = jsn.context
        const timer = this.timers[ctx]

        const currentMs = new Date().getTime()
        if (currentMs - timer.keyDownMs > 1200) {
            timer.resetTimer()
        } else {
            switch (timer.status) {
                case timerStatus.STANDBY:
                    timer.startTimer()
                    break
                case timerStatus.RUNNING:
                    timer.pauseTimer()
                    break
                case timerStatus.PAUSED:
                    timer.startTimer()
                    break
                case timerStatus.FINISHED:
                    timer.resetTimer()
                    break
                default:
                    break
            }
        }
    },
};

const timerStatus = Object.freeze({
    STANDBY: Symbol(0),
    RUNNING: Symbol(1),
    PAUSED: Symbol(2),
    FINISHED: Symbol(3),
})

class Timer {
    constructor(jsn) {
        console.log('new Timer', this)
        this.context = jsn.context
        this.status = timerStatus.STANDBY
        this.config = {
            timerSec: 900,
            alarmSound: 'None',
            alarmVolume: 20,
            alarmBlinkEnabled: false,
            blinkingColor: '#606060',
        }
        this.updateSettings(jsn.payload.settings)

        this.remainingSec = this.config.timerSec
        this.updateTitle(this.config.timerSec)
    }

    updateSettings(settings) {
        console.log('updateSettings', this)
        if (!settings) {
            return
        }

        if (settings.hasOwnProperty('timersec')) {
            this.config.timerSec = parseInt(settings.timersec, 10)
            if (this.status === timerStatus.STANDBY) {
                this.remainingSec = this.config.timerSec
                this.updateTitle(this.config.timerSec)
            }
        }

        if (settings.hasOwnProperty('alarmSound')) {
            this.config.alarmSound = settings.alarmSound
        }

        if (settings.hasOwnProperty('alarmVolume')) {
            this.config.alarmVolume = parseInt(settings.alarmVolume, 10)
        }

        if (settings.hasOwnProperty('alarmBlinkEnabled')) {
            this.config.alarmBlinkEnabled = settings.alarmBlinkEnabled === 'true'
        }

        if (settings.hasOwnProperty('blinkingColor')) {
            this.config.blinkingColor = settings.blinkingColor
        }
    }

    startTimer() {
        console.log('startTimer', this)

        this.countdown = setInterval(function () {
            console.log('tick')

            this.remainingSec--
            this.updateTitle(this.remainingSec)
            if (this.remainingSec <= 0) {
                this.finishTimer(this.context)
            }
        }.bind(this), 1000)
        this.status = timerStatus.RUNNING
    }

    pauseTimer() {
        console.log('pauseTimer', this)

        clearInterval(this.countdown)
        this.countdown = null
        this.status = timerStatus.PAUSED
    }

    finishTimer() {
        console.log('finishTimer', this)

        if (this.countdown) {
            clearInterval(this.countdown)
            this.countdown = null
        }

        if (this.config.alarmBlinkEnabled) {
            $SD.api.setImage(this.context, new SvgUrl(this.config.blinkingColor).getUrl())
            this.blinking = true
            this.blinkInterval = setInterval(function () {
                const newColor = this.blinking ? '#000000' : this.config.blinkingColor
                $SD.api.setImage(this.context, new SvgUrl(newColor).getUrl())
                this.blinking = !this.blinking
            }.bind(this), 500)
        }

        if (this.config.alarmSound && this.config.alarmSound !== 'None') {
            const sound = new Audio('action/sounds/' + this.config.alarmSound)
            sound.volume = this.config.alarmVolume / 100.0
            sound.loop = true
            sound.play()
            this.sound = sound
        }

        this.status = timerStatus.FINISHED
    }

    resetTimer() {
        console.log('resetTimer', this)

        if (this.countdown) {
            clearInterval(this.countdown)
            this.countdown = null
        }
        if (this.blinkInterval) {
            clearInterval(this.blinkInterval)
            this.blinkInterval = null
        }
        if (this.sound) {
            this.sound.pause()
            this.sound = null
        }
        $SD.api.setImage(this.context, '')
        this.updateTitle(this.config.timerSec)
        this.remainingSec = this.config.timerSec
        this.status = timerStatus.STANDBY
    }

    updateTitle(sec) {
        console.log('updateTitle', sec)
        const mm = ('00' + Math.floor(sec / 60)).slice(-2)
        const ss = ('00' + (sec % 60)).slice(-2)
        $SD.api.setTitle(this.context, mm + ':' + ss)
    }
}

class SvgUrl {
    constructor(rgbStr) {
        this.rgbStr = rgbStr
    }

    getUrl() {
        return 'data:image/svg+xml;charset=utf8,<svg width="144" height="144" xmlns="http://www.w3.org/2000/svg"><rect stroke="'
            + this.rgbStr
            + '" id="svg_1" height="144" width="144" y="0" x="0" fill="'
            + this.rgbStr
            + '"/></svg>'
    }
}
