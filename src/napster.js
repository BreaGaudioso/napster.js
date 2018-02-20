//  Copyright (c) 2017 Napster / Rhapsody International
//  Code released under the MIT license.
//  See https://github.com/Napster/napster.js#the-mit-license-mit for more detail.
//  The first thing you need to do, after including Napster.js in your app (but before using it), is initialize the Napster object with your application key.
//
//     Napster.init({
//       consumerKey: 'foo'
//     });
//

(function(exports, $, JSON) {

  'use strict';

  if (!exports || !$ || !$.ajax || !JSON) return;

  var stringify = JSON.stringify;
  JSON.stringify = function(o) {
    return stringify(o, function(k, v) {
      if (k === 'genre') {
        return {
          id: v.id,
          name: v.name
        };
      }
      return v;
    });
  };

  var method = function(o, fname, f) {
    var old = o[fname];
    o[fname] = function() {
      if (f.length === arguments.length) {
        return f.apply(this, arguments); // o -> this
      }
      else if (typeof old === 'function') {
        return old.apply(this, arguments);
      }
    };
  };

  var ACCESS_TOKEN_KEY = 'napster.member.accessToken',
      REFRESH_TOKEN_KEY = 'napster.member.refreshToken',
      streamingPlayer,
      player,
      API_KEY;

  var Member = function(obj) {
    for (var k in obj) {
      this[k] = obj[k];
    }
  };

  var Library = function(member) {
    this.member = member;
  };

  function isFlash () {
    return player === 'FLASH_PLAYER';
  };

  var Napster = {
    // ### Initialization Options
    // Set your developer key and application ID here.  You can also (optionally) specify which API and catalog versions you prefer.
    //
    //     Napster.init({
    //       consumerKey: options.consumerKey,
    //       version: 'v1',
    //       catalog: 'EN',
    //       isHTML5Compatible: true
    //     });

    init: function(options) {
      this.api.consumerKey = options.consumerKey;
      API_KEY = options.consumerKey;
      this.api.version = options.version || this.api.version;
      this.api.catalog = options.catalog || this.api.catalog;

      function shouldLoadHTML5Engine() {
        // Browser detection goes here. Override detection by setting the playback engine option.

        if (options.isHTML5Compatible === true) {
          return true;
        }

        // TODO: Detect browser

        // Logic should be written as follows. If in IE, return false
        // If mobile, chrome, firefox, safari, return true
      }

      var id = options.player || 'player-frame';

      if (id && typeof id === 'string') {
        var that = this, d = $('#' + id);

        if (shouldLoadHTML5Engine()) {
          //Load HTML5 playback engine
          player = 'HTML5_PLAYER';

          that.player = new Html5Player();
          $("<video id='napster-streaming-player' class='video-js'></video>").appendTo($(document.body));

          $.ajax({
            url: 'http://origin-napi-gateway-int.internal.rhapsody.com/v2/streaming-player.js', // This will eventually be served from api.napster.com.
            dataType: 'script',
            async: true,
            success: function () {
              Napster.player.fire('ready');
            }
          });
        } else {
          //Fallback to flash
          player = 'FLASH_PLAYER';
          that.player = new FlashPlayer();
          if (d.length === 0) {
            $(function() {
              var f = $('<iframe></iframe>')
                .attr('id', id)
                .attr('name', id)
                .attr('src', 'http://api.napster.com/v1.1/player/index.html?apikey=' + options.consumerKey)
                .attr('frameborder', 'no')
                .attr('style', 'display:none;')
                .appendTo($(document.body))
                .load(function() {
                  that.player.win = f.get(0);
                });
            });
          }
          else if (d.get(0) instanceof HTMLIFrameElement) {
            that.player.win = d.get(0);
          }
          else {
            throw new Error('The element "' + id + '" is not an HTMLIFrameElement.')
          }
        }
      }
    }
  }

    Napster.api = {
      host: 'api.napster.com',
      catalog: 'US',
      version: 'v2.2',
      endpoint: function(secure) {
        return (secure ? 'https://' : 'http://') + [this.host, this.version].join('/');
      },
      headers: function(secure) {
        var h = {};

        if (secure && Napster.member.accessToken) {
          h['Authorization'] = 'Bearer ' + Napster.member.accessToken;
        }

        return h;
      },
      dataType: function() {
        return 'json';
      },

      get: function(secure, path, cb) {

        var data = { apikey: this.consumerKey };

        $.ajax({
          type: 'GET',
          dataType: this.dataType(),
          data: data,
          headers: this.headers(secure),
          url: this.endpoint(secure) + path,
          success: function(data, textStatus, jqXHR) {
            cb(data);
          },
          error: function(jqXHR) {
            cb({ status: jqXHR.status, error: jqXHR.statusText, response: jqXHR.responseJSON });
          }
        });
      },

      post: function(secure, path, data, cb) {

        if (!data) data = {};

        $.ajax({
          type: data._method || 'POST',
          data: data,
          dataType: this.dataType(),
          headers: this.headers(secure),
          url: this.endpoint(secure) + path + (secure ? '' : '?apikey=' + this.consumerKey),
          success: function(data, textStatus, jqXHR) {
            cb(data);
          },
          error: function(jqXHR) {
            cb({ status: jqXHR.status, error: jqXHR.statusText, response: jqXHR.responseJSON });
          }
        });
      },

      put: function(secure, path, data, cb) {
        data._method = 'PUT';
        this.post.call(this, secure, path, data, cb);
      },

      del: function(secure, path, data, cb) {
        data._method = 'DELETE';
        this.post.call(this, secure, path, data, cb);
      }
    };

    Napster.member =  new function() {
      var m = new Member({
        accessToken: exports.localStorage[ACCESS_TOKEN_KEY],
        refreshToken: exports.localStorage[REFRESH_TOKEN_KEY]
      });

      return m;
    };
    Napster.previewer = {
      play: function() {
        return this;
      },
      pause: function() {
        return this;
      }
    };
    Napster.windows = function(win) {
      return {
        post: function(method, args) {
          if (!win) {
            throw new Error('An iframe was not found at that reference.');
            return;
          }
          win.contentWindow.postMessage({ method: method, args: Napster.util.jsonClean(args || {}) }, "*");
        }
      }
    };
    Napster.on = function(eventName, callback) {
      window.addEventListener(eventName, callback);
    };
    Napster.util = {
      secondsToTime: function(s) {
        if (!isNaN(s)) {
          var minutes = Math.floor(s / 60);
          var seconds = Math.floor(s) % 60;
          return minutes + ':' + ((seconds < 10) ? '0' + seconds : seconds);
        }
        return '0:00';
      },
      jsonClean: function(o) {
        return JSON.parse(JSON.stringify(o, function(k, v) {
          if (k === 'genre') return { id: v.id, name: v.name };
          return v;
        }));
      }
    };
  // };

  method(Member.prototype, 'set', function(creds) {
    if (creds && creds.accessToken && creds.refreshToken) {
      this.accessToken = exports.localStorage[ACCESS_TOKEN_KEY] = creds.accessToken;
      this.refreshToken = exports.localStorage[REFRESH_TOKEN_KEY] = creds.refreshToken;
      Napster.player.auth(creds.accessToken);
    }
  });

  method(Member.prototype, 'unset', function() {
    this.accessToken = this.refreshToken = null;

    exports.localStorage.removeItem(ACCESS_TOKEN_KEY);
    exports.localStorage.removeItem(REFRESH_TOKEN_KEY);
  });

  method(Member.prototype, 'load', function() {
    this.accessToken = exports.localStorage[ACCESS_TOKEN_KEY];
    this.refreshToken = exports.localStorage[REFRESH_TOKEN_KEY];

    return this;
  });

  method(Member.prototype, 'signedIn', function() {
    return (this.accessToken != null && this.refreshToken != null);
  });


  function FlashPlayer () {
    this.frameReady = false;
    this.ready = false;
  };

  FlashPlayer.prototype.auth = function auth() {
    if (Napster.api.consumerKey && Napster.member.accessToken) {
      Napster.windows(this.win).post('auth', { consumerKey: Napster.api.consumerKey, accessToken: Napster.member.accessToken  });
    }
  };

  FlashPlayer.prototype.play = function play(o){
    Napster.previewer.pause();
    Napster.windows(this.win).post('play', o);
    return this;
  };

  FlashPlayer.prototype.pause = function pause() {
    Napster.windows(this.win).post('pause');
    return this;
  };

  FlashPlayer.prototype.resume = function resume() {
    //TODO: figure out how flash does this/ if it is needed, etc.
  };
  FlashPlayer.prototype.next = function next() {
    Napster.windows(this.win).post('playNext');
  };

  FlashPlayer.prototype.previous = function previous() {
    Napster.windows(this.win).post('playPrevious');
  };

  FlashPlayer.prototype.queue = function queue() {
    Napster.windows(this.win).post('queue', o);
    return this;
  };

  FlashPlayer.prototype.clearQueue = function clearQueue() {
    Napster.windows(this.win).post('clearQueue');
  };

  FlashPlayer.prototype.toggleShuffle = function toggleShuffle() {
    Napster.windows(this.win).post('toggleShuffle');
  };

  FlashPlayer.prototype.toggleClass = function toggleClass() {
    Napster.windows(this.win).post('toggleRepeat');
  };

  FlashPlayer.prototype.seek = function seek() {
    Napster.windows(this.win).post('seek', t);
  };

  FlashPlayer.prototype.setVolume = function setVolume() {
    Napster.windows(this.win).post('setVolume', n);
  };

  FlashPlayer.prototype.fire = function fire(eventName){
    window.parent.postMessage({ type: eventName }, "*");
  }

  FlashPlayer.prototype.on = function on(eventName, callback){
    var p = this;

    window.addEventListener('message', function(m) {
      if (m.data.type === 'playerframeready') {
        p.frameReady = true;
      }
      else if (m.data.type === 'ready') {
        p.ready = true;

      }
      else if (m.data.type === 'playsessionexpired') {
        p.paused = false;
        p.playing = false;
      }

      if (p.frameReady && p.ready && !p.authed) {
        p.authed = true;
        p.auth();
      }
      if (m.data.type === eventName) {
        if (m.data.data && m.data.data.id) {
          m.data.data.id = m.data.data.id.replace('tra', 'Tra');
          var c = m.data.data.code,
              playing = (c === 'PlayStarted' || (c !== 'PlayComplete' && c !== 'Paused' && c !== 'BufferEmpty' && c !== 'NetworkDropped' && c !== 'PlayInterrupted' && c !== 'IdleTimeout')),
              paused = (c === 'Paused' || c === 'NetworkDropped' || c === 'PlayInterrupted' || c === 'IdleTimeout');
          p.playing = m.data.data.playing = playing;
          p.paused = m.data.data.paused = paused;
          p.currentTrack = (p.playing || p.paused) ? m.data.data.id : null;
        }
        callback.call(this, m.data);
      }
    });
    return this;
  };

  function Html5Player () {
    this.streamingPlayer = undefined;
    this.queued = [];
    this.played = [];
    this.repeat = false;
    this.shuffled = false;
    this.frameReady = false;
    this.ready = false;
    return this;
  };

  Html5Player.prototype.auth = function auth() {
    // TODO: i feel like this shouldnt be in the auth function???
    var that = this;
    this.streamingPlayer = new StreamingPlayer({
      id: 'napster-streaming-player',
      apikey: API_KEY,
      token: Napster.member.accessToken,
      enableLogging: true,
      bitrate: 192,
      downgrade: true,
      currentUser: {},
      env: 'production'
    });
    this.streamingPlayer.callbackHandler('trackEnded', function() {
      // TODO: i feel like this shouldnt be in the auth function???
      window.parent.postMessage({ type: 'playevent', data: { id: o, code: 'PlayComplete', playing: false } }, "*")
      if (that.repeat === false){
        that.next();
      } else {
        that.streamingPlayer.play(that.currentTrack, 'UNKNOWN');
      }
    });
  };

  Html5Player.prototype.play = function play(o){
    this.streamingPlayer.play(o, 'UNKNOWN');
    this.played.push(o)
    window.parent.postMessage({ type: 'playevent', data: { id: o, code: 'PlayStarted', playing: true } }, "*")
  };
  Html5Player.prototype.pause = function pause() {
    this.streamingPlayer.pause();
    window.parent.postMessage({ type: 'playevent', data: { id: this.currentTrack, code: 'Paused', playing: false } }, "*")
  };

  Html5Player.prototype.resume = function resume() {
    this.streamingPlayer.resume(this.currentTrack, 'UNKNOWN');
    window.parent.postMessage({ type: 'playevent', data: { id: this.currentTrack, code: 'PlayStarted', playing: true } }, "*")
  };

  Html5Player.prototype.next = function next() {
    var queue = this.shuffled === false ? this.queued : this.shuffledQueued;
    if (queue.length >= 1) {
      // only do something if there are songs left in the queue
      this.shuffled === false ? this.play(this.queued.pop()) : this.play(this.shuffledQueued.pop());
    }
  };
  Html5Player.prototype.previous = function previous() {
      if (this.played.length === 1) {
        // when there are no songs left, the previous button will just restart the current track, and not do queue manipulation.
        this.streamingPlayer.play(this.played[0], 'UNKNOWN');
        window.parent.postMessage({ type: 'playevent', data: { id: this.played[0], code: 'PlayStarted', playing: true } }, "*");
      } else {
        this.shuffled === false ? this.queued.push(this.played.pop()) : this.shuffledQueued.push(this.played.pop());
        this.play(this.played.pop());
      }
    };
  Html5Player.prototype.queue = function queue() {
    this.queued.push(o);
  };
  Html5Player.prototype.clearQueue = function clearQueue() {
    this.queued = [];
    this.shuffledQueued = [];
    this.played = [];
  };
  Html5Player.prototype.toggleShuffle = function toggleShuffle() {
    this.shuffled = this.shuffled === true ? false : true;
    this.shuffledQueued = this.queued.map(function (a) {
      return [Math.random(), a];
    }).sort(function (a, b) {
      return a[0] - b[0];
    }).map(function (a) {
      return a[1];
    });
  };
  Html5Player.prototype.toggleRepeat = function toggleRepeat() {
    this.repeat = this.repeat === false ? true : false;
  };
  Html5Player.prototype.showQueue = function showQueue() {
    if (this.shuffled === true){
      return this.shuffledQueued;
    } else {
      return this.queued;
    }
  };
  Html5Player.prototype.showPlayed = function showPlayed() {
    return this.played;
  };
  Html5Player.prototype.seek = function seek(t){
    this.streamingPlayer.seek(this.currentTrack, t);
  };
  Html5Player.prototype.setVolume = function setVolume(n){
    this.streamingPlayer.setVolume(n);
  };

  Html5Player.prototype.fire = function fire(eventName){
    window.parent.postMessage({ type: eventName }, "*");
  }

  Html5Player.prototype.on = function on(eventName, callback){
    var p = this;

    window.addEventListener('message', function(m) {
      if (m.data.type === 'playerframeready') {
        p.frameReady = true;
      }
      else if (m.data.type === 'ready') {
        p.ready = true;

      }
      else if (m.data.type === 'playsessionexpired') {
        p.paused = false;
        p.playing = false;
      }

      if (p.frameReady && p.ready && !p.authed) {
        p.authed = true;
        p.auth();
      }
      if (m.data.type === eventName) {
        if (m.data.data && m.data.data.id) {
          m.data.data.id = m.data.data.id.replace('tra', 'Tra');
          var c = m.data.data.code,
              playing = (c === 'PlayStarted' || (c !== 'PlayComplete' && c !== 'Paused')),
              paused = (c === 'Paused');
          p.playing = m.data.data.playing = playing;
          p.paused = m.data.data.paused = paused;
          p.currentTrack = (p.playing || p.paused) ? m.data.data.id : null;
        }
        callback.call(this, m.data);
      }
    });
    return this;
  };


  // Everyone listens to these events
  // Napster.player
  //   .on('playevent', function(e) {  })
  //   .on('playtimer', function(e) {  })

  exports.Napster = Napster;
  exports.Member = Member;

})(window, jQuery, JSON);
