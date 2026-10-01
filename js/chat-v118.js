/* ============================================
   CHEMVENTUR v118 - TEXT CHAT! 💬
   Real-time messaging between players!
   Built with 💚 by Opus for Pumpkin 🎃
   ============================================ */

(function() {
  
  CHEMVENTUR.Chat = {
    // Firebase
    chatRef: null,
    
    // State
    enabled: false,
    messages: [],
    maxMessages: 50,
    
    // UI
    chatWindow: null,
    chatMessages: null,
    chatInput: null,
    chatSend: null,
    isMinimized: false,
    
    // Sound
    notificationSound: null,
    
    // ===== INIT =====
    async init() {
      console.log('💬 Initializing Chat System...');
      
      // Check if multiplayer is connected
      if (!CHEMVENTUR.Multiplayer || !CHEMVENTUR.Multiplayer.connected) {
        console.log('⚠️ Chat requires multiplayer connection');
        return false;
      }
      
      try {
        // Setup Firebase reference (scoped to the current room, not global)
        if (!CHEMVENTUR.Multiplayer.roomRef) {
          console.log('⚠️ Chat requires an active room');
          return false;
        }
        this.chatRef = CHEMVENTUR.Multiplayer.roomRef.child('chat/messages');
        
        // Setup UI
        this.setupUI();
        
        // Listen for messages
        this.listenForMessages();
        
        // Send welcome message
        this.sendSystemMessage(
          CHEMVENTUR.Multiplayer.myPlayerName + ' joined the game! 🎃'
        );
        
        this.enabled = true;
        console.log('✅ Chat system initialized!');
        
        return true;
        
      } catch (e) {
        console.error('❌ Chat init failed:', e);
        return false;
      }
    },
    
    // ===== SETUP UI =====
    setupUI() {
      console.log('🎨 Setting up chat UI...');
      
      // Create chat window HTML
      const chatHTML = `
        <div id="chat-window" class="chat-container">
          <div class="chat-header">
            <span>💬 Chat</span>
            <button class="chat-minimize" id="chat-minimize">−</button>
          </div>
          <div class="chat-messages" id="chat-messages"></div>
          <div class="chat-input-row">
            <input type="text" id="chat-input" placeholder="Type message..." maxlength="200">
            <button id="chat-send">Send</button>
          </div>
        </div>
      `;
      
      // Add to page
      document.body.insertAdjacentHTML('beforeend', chatHTML);
      
      // Get references
      this.chatWindow = document.getElementById('chat-window');
      this.chatMessages = document.getElementById('chat-messages');
      this.chatInput = document.getElementById('chat-input');
      this.chatSend = document.getElementById('chat-send');
      
      // Setup event listeners
      this.chatSend.addEventListener('click', () => this.handleSend());
      
      this.chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.handleSend();
        }
      });
      
      document.getElementById('chat-minimize').addEventListener('click', () => {
        this.toggleMinimize();
      });
      
      console.log('✅ Chat UI ready!');
    },
    
    // ===== LISTEN FOR MESSAGES =====
    listenForMessages() {
      console.log('👂 Listening for chat messages...');
      
      // Listen for new messages
      this.chatRef.limitToLast(this.maxMessages).on('child_added', (snapshot) => {
        const message = snapshot.val();
        if (message) {
          this.addMessageToUI(message);
        }
      });
      
      // Cleanup old messages periodically
      setInterval(() => {
        this.cleanupOldMessages();
      }, 30000); // Every 30 seconds
    },
    
    // ===== SEND MESSAGE =====
    sendMessage(text) {
      if (!text || text.trim().length === 0) return;
      
      const message = {
        id: 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        playerId: CHEMVENTUR.Multiplayer.myPlayerId,
        playerName: CHEMVENTUR.Multiplayer.myPlayerName,
        playerColor: CHEMVENTUR.Multiplayer.myColor,
        text: text.trim(),
        timestamp: Date.now(),
        type: 'chat'
      };
      
      // Add to Firebase
      this.chatRef.push(message);
      
      console.log('📤 Sent message:', text);
    },
    
    // ===== ADD MESSAGE FROM A LOCAL SOURCE (e.g. fun bots) =====
    addMessage(name, text) {
      if (!this.enabled || !this.chatRef) return;

      const message = {
        id: 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        playerId: 'localbot',
        playerName: name,
        playerColor: '#ffaa00',
        text: text,
        timestamp: Date.now(),
        type: 'chat'
      };

      this.chatRef.push(message);
    },

    // ===== SEND SYSTEM MESSAGE =====
    sendSystemMessage(text) {
      const message = {
        id: 'sys_' + Date.now(),
        playerId: 'system',
        playerName: 'System',
        playerColor: '#888888',
        text: text,
        timestamp: Date.now(),
        type: 'system'
      };
      
      this.chatRef.push(message);
    },
    
    // ===== HANDLE SEND BUTTON =====
    handleSend() {
      const text = this.chatInput.value;
      if (text && text.trim().length > 0) {
        this.sendMessage(text);
        this.chatInput.value = '';
      }
    },
    
    // ===== ADD MESSAGE TO UI =====
    addMessageToUI(message) {
      // Don't add duplicates
      if (this.messages.find(m => m.id === message.id)) {
        return;
      }
      
      this.messages.push(message);
      
      // Create message element
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-message';
      msgDiv.dataset.messageId = message.id;
      
      if (message.type === 'system') {
        msgDiv.classList.add('chat-system');
        msgDiv.innerHTML = `<span class="chat-system-text">${this.escapeHTML(message.text)}</span>`;
      } else {
        const playerName = document.createElement('span');
        playerName.className = 'chat-player-name';
        playerName.style.color = message.playerColor;
        playerName.textContent = '[' + message.playerName + ']:';
        
        const messageText = document.createElement('span');
        messageText.className = 'chat-text';
        messageText.textContent = ' ' + message.text;
        
        msgDiv.appendChild(playerName);
        msgDiv.appendChild(messageText);
      }
      
      // Add to chat
      this.chatMessages.appendChild(msgDiv);
      
      // Auto-scroll to bottom
      this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
      
      // Play sound (if not our own message)
      if (message.playerId !== CHEMVENTUR.Multiplayer.myPlayerId) {
        this.playNotificationSound();
      }
      
      // Keep only last 50 messages in UI
      if (this.chatMessages.children.length > this.maxMessages) {
        this.chatMessages.removeChild(this.chatMessages.firstChild);
      }
    },
    
    // ===== CLEANUP OLD MESSAGES =====
    cleanupOldMessages() {
      // Remove messages older than 5 minutes from Firebase
      const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
      
      this.chatRef.orderByChild('timestamp').endAt(fiveMinutesAgo).once('value', (snapshot) => {
        const updates = {};
        snapshot.forEach((child) => {
          updates[child.key] = null; // Mark for deletion
        });
        
        if (Object.keys(updates).length > 0) {
          this.chatRef.update(updates);
          console.log('🧹 Cleaned up', Object.keys(updates).length, 'old messages');
        }
      });
    },
    
    // ===== TOGGLE MINIMIZE =====
    toggleMinimize() {
      this.isMinimized = !this.isMinimized;
      
      if (this.isMinimized) {
        this.chatWindow.classList.add('minimized');
        document.getElementById('chat-minimize').textContent = '+';
      } else {
        this.chatWindow.classList.remove('minimized');
        document.getElementById('chat-minimize').textContent = '−';
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
      }
    },
    
    // ===== PLAY NOTIFICATION SOUND =====
    playNotificationSound() {
      // Simple beep using Web Audio API
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        oscillator.frequency.value = 800;
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.1);
      } catch (e) {
        // Silent fail
      }
    },
    
    // ===== ESCAPE HTML =====
    escapeHTML(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    // ===== CLEANUP =====
    cleanup() {
      console.log('🧹 Cleaning up chat...');
      
      if (this.chatRef) {
        this.chatRef.off();
      }
      
      if (this.chatWindow) {
        this.chatWindow.remove();
      }
      
      this.messages = [];
      this.enabled = false;
    }
  };
  
  console.log('💬 Chat module loaded!');
  
})();
