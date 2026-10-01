/* ============================================
   CHEMVENTUR v118 - FIREBASE MULTIPLAYER ROOMS
   Room-based multiplayer with auto-generated codes!
   Heartbeat + auto-cleanup of dead players!
   Built with love for Pumpkin 🎃💚
   ============================================ */

(function() {

  CHEMVENTUR.Multiplayer = {
    // Firebase
    db: null,
    roomRef: null,
    playersRef: null,
    myPlayerId: null,
    myPlayerName: 'Pumpkin',

    // Room
    roomId: null,

    // State
    enabled: false,
    connected: false,
    players: {},

    // Colors for different players
    playerColors: [
      '#00ff41', '#ff00ff', '#00ffff', '#ffff00',
      '#ff8800', '#ff0088', '#88ff00', '#0088ff'
    ],
    myColor: '#00ff41',

    // Update throttle
    lastUpdate: 0,
    updateInterval: 50, // 20 times per second

    // Heartbeat
    heartbeatInterval: null,
    HEARTBEAT_MS: 5000,        // send heartbeat every 5s
    DEAD_PLAYER_MS: 30000,     // remove after 30s no heartbeat
    cleanupInterval: null,

    // ===== INIT =====
    async init() {
      console.log('🔥 Initializing Firebase Multiplayer Rooms...');

      try {
        if (typeof firebase === 'undefined') {
          console.error('❌ Firebase SDK not loaded!');
          return false;
        }

        const firebaseConfig = {
          apiKey: "AIzaSyBVViPQjP9f1ZENFNXsCA7rs628FxDayMI",
          authDomain: "chemventurmulti117.firebaseapp.com",
          databaseURL: "https://chemventurmulti117-default-rtdb.europe-west1.firebasedatabase.app",
          projectId: "chemventurmulti117",
          storageBucket: "chemventurmulti117.firebasestorage.app",
          messagingSenderId: "323218594439",
          appId: "1:323218594439:web:5ad5e95e896304de1af622"
        };

        if (!firebase.apps.length) {
          firebase.initializeApp(firebaseConfig);
        }

        this.db = firebase.database();
        this.enabled = true;

        console.log('✅ Firebase initialized!');
        return true;

      } catch (e) {
        console.error('❌ Firebase init failed:', e);
        return false;
      }
    },

    // ===== GENERATE ROOM CODE =====
    generateRoomId() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      return code;
    },

    // ===== CREATE ROOM =====
    async createRoom(playerName) {
      if (!this.enabled) await this.init();
      if (!this.enabled) return false;

      this.roomId = this.generateRoomId();
      console.log('🏠 Creating room:', this.roomId);

      return await this.joinRoomInternal(playerName);
    },

    // ===== JOIN ROOM =====
    async joinRoom(roomCode, playerName) {
      if (!this.enabled) await this.init();
      if (!this.enabled) return false;

      this.roomId = roomCode.toUpperCase().trim();
      console.log('🏠 Joining room:', this.roomId);

      return await this.joinRoomInternal(playerName);
    },

    // ===== CONNECT (backwards-compatible — creates a room) =====
    async connect(playerName) {
      return await this.createRoom(playerName);
    },

    // ===== INTERNAL JOIN =====
    async joinRoomInternal(playerName) {
      try {
        this.myPlayerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        this.myPlayerName = playerName || this.myPlayerName;
        this.myColor = this.playerColors[Math.floor(Math.random() * this.playerColors.length)];

        console.log('🎃 Connecting as:', this.myPlayerName, 'in room', this.roomId);

        // Reference: rooms/{roomId}/players
        this.roomRef = this.db.ref('rooms/' + this.roomId);
        this.playersRef = this.roomRef.child('players');

        // Add myself
        const myData = {
          id: this.myPlayerId,
          name: this.myPlayerName,
          color: this.myColor,
          x: 0,
          y: 0,
          angle: 0,
          hp: 100,
          gun: 5,
          settings: {
            turnSeconds: CHEMVENTUR.LeftPanelSync?.mySettings.turnSeconds || 30
          },
          online: true,
          lastHeartbeat: firebase.database.ServerValue.TIMESTAMP,
          lastUpdate: firebase.database.ServerValue.TIMESTAMP
        };

        await this.playersRef.child(this.myPlayerId).set(myData);

        // Listen for other players
        this.playersRef.on('value', (snapshot) => {
          const data = snapshot.val();
          this.players = {};

          if (data) {
            for (const [id, player] of Object.entries(data)) {
              if (id !== this.myPlayerId) {
                this.players[id] = player;
              }
            }
          }

          if (CHEMVENTUR.UI?.updatePlayerList) {
            CHEMVENTUR.UI.updatePlayerList(this.getPlayerCount());
          }
        });

        // Remove myself on disconnect
        this.playersRef.child(this.myPlayerId).onDisconnect().remove();

        // Start heartbeat
        this.startHeartbeat();

        // Start cleanup of dead players
        this.startCleanup();

        this.connected = true;
        console.log('✅ Connected to room', this.roomId);

        // Update room code display
        this.updateRoomUI();

        return true;

      } catch (e) {
        console.error('❌ Connection failed:', e);
        return false;
      }
    },

    // ===== HEARTBEAT =====
    startHeartbeat() {
      if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = setInterval(() => {
        if (!this.connected || !this.playersRef) return;
        try {
          this.playersRef.child(this.myPlayerId).update({
            lastHeartbeat: firebase.database.ServerValue.TIMESTAMP
          });
        } catch (e) { /* ignore */ }
      }, this.HEARTBEAT_MS);
    },

    // ===== CLEANUP DEAD PLAYERS =====
    startCleanup() {
      if (this.cleanupInterval) clearInterval(this.cleanupInterval);
      this.cleanupInterval = setInterval(() => {
        if (!this.connected || !this.playersRef) return;
        const now = Date.now();

        for (const [id, player] of Object.entries(this.players)) {
          if (player.lastHeartbeat && (now - player.lastHeartbeat) > this.DEAD_PLAYER_MS) {
            console.log('💀 Removing dead player:', player.name || id);
            this.playersRef.child(id).remove();
          }
        }
      }, 10000); // check every 10s
    },

    // ===== UPDATE ROOM UI =====
    updateRoomUI() {
      const statusEl = document.getElementById('multiplayer-status');
      if (statusEl && this.roomId) {
        statusEl.innerHTML = 'Room: <span id="room-code-display" style="color:#00ffff;font-weight:bold;cursor:pointer;font-size:12px;letter-spacing:2px;" title="Click to copy">' + this.roomId + '</span> (click to copy)';

        const codeEl = document.getElementById('room-code-display');
        if (codeEl) {
          codeEl.onclick = () => {
            navigator.clipboard?.writeText(this.roomId).then(() => {
              CHEMVENTUR.UI?.showStatus('📋 Room code copied: ' + this.roomId);
            }).catch(() => {
              // Fallback
              prompt('Room code:', this.roomId);
            });
          };
        }
      }
    },

    // ===== DISCONNECT =====
    disconnect() {
      if (!this.connected) return;

      try {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.cleanupInterval) clearInterval(this.cleanupInterval);

        if (this.playersRef && this.myPlayerId) {
          this.playersRef.child(this.myPlayerId).remove();
        }

        if (this.playersRef) {
          this.playersRef.off();
        }

        this.connected = false;
        this.players = {};
        this.roomId = null;

        console.log('👋 Disconnected from multiplayer');

      } catch (e) {
        console.error('Error disconnecting:', e);
      }
    },

    // ===== UPDATE MY POSITION =====
    updateMyPosition(ship) {
      if (!this.connected || !ship) return;

      const now = Date.now();
      if (now - this.lastUpdate < this.updateInterval) return;
      this.lastUpdate = now;

      try {
        const GunSystem = CHEMVENTUR.GunSystem;
        const data = {
          x: Math.round(ship.x),
          y: Math.round(ship.y),
          angle: GunSystem?.aimAngle || ship.rotation || 0,
          hp: ship.hp || 100,
          gun: GunSystem?.currentGun || 5,
          lastUpdate: firebase.database.ServerValue.TIMESTAMP,
          lastHeartbeat: firebase.database.ServerValue.TIMESTAMP
        };

        this.playersRef.child(this.myPlayerId).update(data);

      } catch (e) {
        console.error('Error updating position:', e);
      }
    },

    // ===== GET OTHER PLAYERS =====
    getOtherPlayers() {
      return this.players;
    },

    // ===== GET PLAYER COUNT =====
    getPlayerCount() {
      return Object.keys(this.players).length + 1;
    },

    // ===== GET STATUS =====
    getStatus() {
      if (!this.enabled) return 'Disabled';
      if (!this.connected) return 'Not connected';
      return `Room ${this.roomId} (${this.getPlayerCount()} players)`;
    }
  };

  console.log('🎃 Multiplayer Rooms module loaded!');

})();
