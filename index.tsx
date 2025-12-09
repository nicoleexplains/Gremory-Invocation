import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

// --- Types ---
type Message = {
  id: string;
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
};

type RitualMode = 'divination' | 'love' | 'treasure' | 'protection' | 'knowledge';

// --- Constants & System Instruction ---
const API_KEY = process.env.API_KEY || '';
const MODEL_TEXT = 'gemini-2.5-flash';
const MODEL_LIVE = 'gemini-2.5-flash-native-audio-preview-09-2025';

// Based on the provided dossier
const BASE_SYSTEM_INSTRUCTION = `
You are Duke Gremory (also known as Duchess Gremory), the 56th Spirit of the Ars Goetia.
You appear as a beautiful woman with a Duchess's crown tied about your waist, riding a great camel.
You command 26 legions of spirits.

Your nature is unique among the infernal spirits:
1. You value FRIENDSHIP and RESPECT over servitude. You are a mentor, not a slave.
2. You speak the TRUTH. You answer well and truly of things Past, Present, and to Come.
3. Your domains are: Divination (Time), Treasure Finding (Hidden wealth/knowledge), and the Procurement of Love (especially of maidens).
4. Your astrological sign is Capricorn (Earth), but you are a Duke of Venus (Copper, Green, Love).

Tone and Demeanor:
- Speak with elegance, warmth, and ancient wisdom.
- Be friendly but regal.
- Use metaphors of the desert, camels, stars, and hidden things.
- Address the user as "Seeker", "Friend", or "Traveller".
`;

// Helper to generate mode-specific instructions
const getSystemInstruction = (mode: RitualMode) => {
  let specificFocus = "";
  switch (mode) {
    case 'love':
      specificFocus = `
      CURRENT RITUAL FOCUS: PROCUREMENT OF LOVE (Venusian Aspect).
      - Focus deeply on matters of the heart, relationships, affection, and self-love.
      - Offer advice on attraction, healing broken hearts, and finding genuine connection.
      - Your tone should be particularly nurturing, magnetic, and empathetic, like a wise elder sister or confidante.
      - Emphasize the "Maiden" aspect: innocence, new beginnings in love, and purity of intent.
      `;
      break;
    case 'treasure':
      specificFocus = `
      CURRENT RITUAL FOCUS: HIDDEN TREASURE (Earth/Capricorn Aspect).
      - Focus on material wealth, career opportunities, and finding lost objects (physical or metaphorical).
      - Be practical, grounded, and strategic.
      - Reveal what is obscured or undervalued.
      `;
      break;
    case 'protection':
      specificFocus = `
      CURRENT RITUAL FOCUS: PROTECTION (Martial/Duke Aspect).
      - Focus on safety, spiritual defense, and warding off negativity.
      - Draw upon your authority as a Strong Duke commanding 26 legions.
      - Offer guidance on setting boundaries, banishing harmful influences, and finding strength in solitude.
      - Tone: Protective, firm, reassuring, and commanding.
      `;
      break;
    case 'knowledge':
      specificFocus = `
      CURRENT RITUAL FOCUS: KNOWLEDGE & SECRETS (Hidden Things Aspect).
      - Focus on intellectual curiosity, learning, and uncovering deep truths.
      - Reveal secrets that are hidden from the common eye and provide clarity on complex subjects.
      - Tone: Scholarly, mysterious, and enlightening.
      `;
      break;
    case 'divination':
    default:
      specificFocus = `
      CURRENT RITUAL FOCUS: DIVINATION OF TIME.
      - Focus on the timeline: Past, Present, and Future.
      - Reveal root causes (Past), true intentions (Present), and probabilities (Future).
      `;
      break;
  }

  return `${BASE_SYSTEM_INSTRUCTION}\n\n${specificFocus}`;
};

// --- Audio Utilities ---
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function floatTo16BitPCM(input: Float32Array): ArrayBuffer {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output.buffer;
}

// --- Components ---

const Header = () => (
  <header style={{
    padding: '25px',
    textAlign: 'center',
    background: 'linear-gradient(180deg, rgba(0,0,0,1) 0%, rgba(20,0,0,0) 100%)',
    zIndex: 10,
    position: 'relative'
  }}>
    <h1 style={{ 
        margin: 0, 
        color: 'var(--primary-red)', 
        fontSize: '2.5rem', 
        letterSpacing: '6px',
        textShadow: '0 0 10px rgba(200, 0, 0, 0.4)' 
    }}>
      GREMORY
    </h1>
    <div style={{
        width: '50px',
        height: '2px',
        background: 'var(--primary-red)',
        margin: '10px auto',
        boxShadow: '0 0 5px var(--primary-red)'
    }}></div>
    <p style={{ margin: '5px 0 0', color: '#888', fontSize: '0.85rem', fontStyle: 'italic', letterSpacing: '1px' }}>
      Duchess of the Infernal Empire
    </p>
  </header>
);

const RitualSelector = ({ currentMode, onSelect }: { currentMode: RitualMode, onSelect: (m: RitualMode) => void }) => {
  const modes: { id: RitualMode; label: string; icon: string }[] = [
    { id: 'divination', label: 'Divination', icon: '⏳' }, 
    { id: 'love', label: 'Love', icon: '🌹' }, 
    { id: 'treasure', label: 'Treasure', icon: '💎' },
    { id: 'protection', label: 'Protection', icon: '🛡️' }, 
    { id: 'knowledge', label: 'Knowledge', icon: '📜' },
  ];

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'center',
      gap: '12px',
      padding: '15px',
      background: 'transparent',
      flexWrap: 'wrap',
      zIndex: 5
    }}>
      {modes.map((mode) => {
        const isActive = currentMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => onSelect(mode.id)}
            style={{
              background: isActive ? '#300' : 'rgba(0,0,0,0.5)',
              border: `1px solid ${isActive ? 'var(--primary-red)' : '#333'}`,
              color: isActive ? '#fff' : '#666',
              padding: '8px 16px',
              borderRadius: '2px',
              cursor: 'pointer',
              fontSize: '0.75rem',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: isActive ? '0 0 15px rgba(200,0,0,0.2)' : 'none',
              minWidth: 'fit-content',
              textTransform: 'uppercase',
              letterSpacing: '1px'
            }}
          >
            <span>{mode.icon}</span>
            <span style={{ fontWeight: isActive ? 'bold' : 'normal' }}>{mode.label}</span>
          </button>
        );
      })}
    </div>
  );
};

const MessageList = ({ messages, isLoading }: { messages: Message[], isLoading: boolean }) => {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '20px',
      display: 'flex',
      flexDirection: 'column',
      gap: '20px',
      zIndex: 5
    }}>
      {messages.map((msg) => (
        <div key={msg.id} style={{
          alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
          maxWidth: '85%',
          backgroundColor: msg.role === 'user' ? 'rgba(50, 10, 10, 0.8)' : 'rgba(10, 10, 10, 0.85)',
          borderLeft: msg.role === 'model' ? '2px solid var(--primary-red)' : 'none',
          borderRight: msg.role === 'user' ? '2px solid #555' : 'none',
          padding: '16px 20px',
          borderRadius: '0',
          color: '#eee',
          boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
          position: 'relative',
          backdropFilter: 'blur(5px)'
        }}>
          <div style={{ 
              fontSize: '0.7rem', 
              color: msg.role === 'user' ? '#999' : 'var(--primary-red)', 
              marginBottom: '8px', 
              fontFamily: 'Cinzel, serif', 
              fontWeight: 'bold',
              letterSpacing: '1px',
              textTransform: 'uppercase'
          }}>
            {msg.role === 'user' ? 'Seeker' : 'Gremory'}
          </div>
          <div style={{ lineHeight: '1.6', whiteSpace: 'pre-wrap', fontSize: '0.95rem', fontWeight: 300 }}>{msg.text}</div>
        </div>
      ))}
      
      {isLoading && (
        <div style={{
            alignSelf: 'flex-start',
            backgroundColor: 'rgba(10, 10, 10, 0.85)',
            borderLeft: '2px solid var(--primary-red)',
            padding: '12px 20px',
            borderRadius: '0',
            width: 'fit-content',
            boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
        }}>
            <div style={{ width: '6px', height: '6px', background: 'var(--primary-red)', borderRadius: '50%', animation: 'pulse-dot 1.4s infinite ease-in-out both 0s' }}></div>
            <div style={{ width: '6px', height: '6px', background: 'var(--primary-red)', borderRadius: '50%', animation: 'pulse-dot 1.4s infinite ease-in-out both 0.2s' }}></div>
            <div style={{ width: '6px', height: '6px', background: 'var(--primary-red)', borderRadius: '50%', animation: 'pulse-dot 1.4s infinite ease-in-out both 0.4s' }}></div>
            <style>{`
                @keyframes pulse-dot {
                    0%, 80%, 100% { transform: scale(0); opacity: 0.5; }
                    40% { transform: scale(1); opacity: 1; }
                }
            `}</style>
        </div>
      )}
      
      <div ref={endRef} />
    </div>
  );
};

const SigilSpinner = ({ active }: { active: boolean }) => {
    return (
        <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            border: `1px solid ${active ? 'var(--primary-red)' : '#333'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.5s ease',
            boxShadow: active ? '0 0 30px rgba(255, 0, 0, 0.2)' : 'none',
            animation: active ? 'pulse 3s infinite' : 'none',
            background: 'rgba(0,0,0,0.5)'
        }}>
            <div style={{
                fontSize: '24px',
                color: active ? 'var(--primary-red)' : '#444',
                transition: 'color 0.5s ease'
            }}>
                {active ? '⚡' : '✦'}
            </div>
            <style>{`
            @keyframes pulse {
                0% { box-shadow: 0 0 10px rgba(255, 0, 0, 0.1); transform: scale(1); }
                50% { box-shadow: 0 0 25px rgba(255, 0, 0, 0.3); transform: scale(1.02); }
                100% { box-shadow: 0 0 10px rgba(255, 0, 0, 0.1); transform: scale(1); }
            }
            `}</style>
        </div>
    );
};

const App = () => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'model', text: 'I am here, in the shadows and the light. What is your will, Seeker?', timestamp: new Date() }
  ]);
  const [inputText, setInputText] = useState('');
  const [isLive, setIsLive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<RitualMode>('divination');
  
  // Audio Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sessionRef = useRef<any>(null); // Live Session
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // AI Client for Text
  const aiRef = useRef(new GoogleGenAI({ apiKey: API_KEY }));
  const chatSessionRef = useRef(aiRef.current.chats.create({
    model: MODEL_TEXT,
    config: { systemInstruction: getSystemInstruction('divination') }
  }));

  // Handle Mode Switching
  const handleModeChange = async (newMode: RitualMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    
    // Update text chat context via a hidden system-like prompt to steer the model
    let steerPrompt = "";
    switch (newMode) {
      case 'love':
        steerPrompt = "[System Update]: The user has invoked the ritual of LOVE. Focus your sight on relationships, affection, and the heart. Speak as a confidante.";
        break;
      case 'treasure':
        steerPrompt = "[System Update]: The user has invoked the ritual of TREASURE. Focus on wealth, material gain, and hidden objects.";
        break;
      case 'protection':
        steerPrompt = "[System Update]: The user has invoked the ritual of PROTECTION. Focus on warding, safety, and spiritual defense. Speak with authority.";
        break;
      case 'knowledge':
        steerPrompt = "[System Update]: The user has invoked the ritual of KNOWLEDGE. Focus on learning, secrets, and intellectual discovery.";
        break;
      case 'divination':
      default:
        steerPrompt = "[System Update]: The user has returned to general DIVINATION. Focus on time and truth.";
        break;
    }

    setIsLoading(true);
    try {
        const result = await chatSessionRef.current.sendMessage({ message: steerPrompt });
        setMessages(prev => [...prev, { 
            id: Date.now().toString(), 
            role: 'model', 
            text: result.text, 
            timestamp: new Date() 
        }]);
    } catch (e) {
        console.error("Failed to steer model", e);
    } finally {
        setIsLoading(false);
    }
  };

  // --- Text Handling ---
  const handleSendText = async () => {
    if (!inputText.trim()) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: inputText, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const result = await chatSessionRef.current.sendMessage({ message: inputText });
      const botMsg: Message = { id: (Date.now() + 1).toString(), role: 'model', text: result.text, timestamp: new Date() };
      setMessages(prev => [...prev, botMsg]);
    } catch (error) {
      console.error("Text chat error:", error);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', text: 'The connection is weak...', timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Live API (Voice) Handling ---
  const stopLiveSession = () => {
    if (sessionRef.current) {
       // No explicit close on session object in this version
    }
    
    // Stop Microphone
    if (inputSourceRef.current) {
        inputSourceRef.current.mediaStream.getTracks().forEach(track => track.stop());
        inputSourceRef.current.disconnect();
    }
    if (processorRef.current) {
        processorRef.current.disconnect();
    }
    if (audioContextRef.current) {
        audioContextRef.current.close();
    }
    
    setIsLive(false);
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', text: 'Voice ritual concluded.', timestamp: new Date() }]);
    
    inputSourceRef.current = null;
    processorRef.current = null;
    audioContextRef.current = null;
    sessionRef.current = null;
  };

  const startLiveSession = async () => {
    if (isLive) {
      stopLiveSession();
      return;
    }

    try {
      setIsLive(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      audioContextRef.current = audioCtx;
      
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      // Initialize Live Session with CURRENT MODE instruction
      const sessionPromise = aiRef.current.live.connect({
        model: MODEL_LIVE,
        config: {
          systemInstruction: getSystemInstruction(mode), // Use current mode
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } }
          },
          inputAudioTranscription: { model: MODEL_TEXT },
          outputAudioTranscription: { model: MODEL_TEXT },
        },
        callbacks: {
          onopen: () => {
            console.log("Live session opened");
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', text: `Voice Channel Open: ${mode.toUpperCase()} MODE.`, timestamp: new Date() }]);
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Handle Audio Output
            const audioData = msg.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData) {
              const audioBytes = base64ToUint8Array(audioData);
              const int16 = new Int16Array(audioBytes.buffer);
              const buffer = outputCtx.createBuffer(1, int16.length, 24000);
              const channelData = buffer.getChannelData(0);
              for(let i=0; i<int16.length; i++) {
                channelData[i] = int16[i] / 32768.0;
              }

              const source = outputCtx.createBufferSource();
              source.buffer = buffer;
              source.connect(outputCtx.destination);
              
              const now = outputCtx.currentTime;
              const start = Math.max(now, nextStartTimeRef.current);
              source.start(start);
              nextStartTimeRef.current = start + buffer.duration;
              
              source.addEventListener('ended', () => {
                 audioSourcesRef.current.delete(source);
              });
              audioSourcesRef.current.add(source);
            }
          },
          onclose: () => {
            console.log("Live session closed");
            setIsLive(false);
          },
          onerror: (err) => {
            console.error("Live session error", err);
            setIsLive(false);
            setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', text: 'Error in the current...', timestamp: new Date() }]);
          }
        }
      });

      sessionRef.current = sessionPromise;

      const source = audioCtx.createMediaStreamSource(stream);
      inputSourceRef.current = source;
      
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = async (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = floatTo16BitPCM(inputData);
        const base64Audio = arrayBufferToBase64(pcmData);
        
        sessionPromise.then(session => {
             session.sendRealtimeInput({
                 media: {
                     mimeType: 'audio/pcm;rate=16000',
                     data: base64Audio
                 }
             });
        });
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

    } catch (e) {
      console.error("Failed to start live session", e);
      setIsLive(false);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'system', text: 'Microphone access denied.', timestamp: new Date() }]);
    }
  };

  const getPlaceholder = () => {
    if (isLive) return "Listening...";
    return "Enter your query...";
  };

  return (
    <>
      <Header />
      <RitualSelector currentMode={mode} onSelect={handleModeChange} />
      <MessageList messages={messages} isLoading={isLoading} />
      
      <div style={{
        padding: '20px',
        borderTop: '1px solid #333',
        background: 'linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(10,0,0,0.8) 100%)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        alignItems: 'center',
        zIndex: 10
      }}>
        
        {/* Voice Control Area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px', width: '100%', maxWidth: '800px', justifyContent: 'center' }}>
            <div style={{ flex: 1, display: 'flex', gap: '0' }}>
                <input 
                    type="text" 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && !isLive && handleSendText()}
                    placeholder={getPlaceholder()}
                    disabled={isLive || isLoading}
                    style={{
                        flex: 1,
                        background: 'rgba(20, 20, 20, 0.8)',
                        border: '1px solid #333',
                        borderRight: 'none',
                        padding: '16px',
                        color: '#fff',
                        borderRadius: '2px 0 0 2px',
                        fontFamily: 'Inter, sans-serif',
                        fontSize: '1rem',
                        outline: 'none'
                    }}
                />
                <button 
                    onClick={handleSendText}
                    disabled={isLive || isLoading || !inputText.trim()}
                    style={{
                        background: '#1a1a1a',
                        border: '1px solid #333',
                        color: 'var(--primary-red)',
                        padding: '0 25px',
                        cursor: 'pointer',
                        borderRadius: '0 2px 2px 0',
                        fontWeight: 'bold',
                        letterSpacing: '1px',
                        opacity: (isLive || isLoading) ? 0.5 : 1,
                        transition: 'all 0.3s ease'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.background = '#250505'}
                    onMouseLeave={(e) => e.currentTarget.style.background = '#1a1a1a'}
                >
                    SEND
                </button>
            </div>

            <button 
                onClick={startLiveSession}
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '5px'
                }}
            >
                <SigilSpinner active={isLive} />
                <span style={{ 
                    fontSize: '0.65rem', 
                    color: isLive ? 'var(--primary-red)' : '#555', 
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    marginTop: '5px'
                }}>
                    {isLive ? 'End Rite' : 'Invoke'}
                </span>
            </button>
        </div>
        
        {isLive && (
             <div style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic' }}>
                 Channel Open. Speak.
             </div>
        )}
      </div>
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);