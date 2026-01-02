/**
 * Message Flow Visualizer
 * 
 * Shows operation routing between client and server with animated flow.
 */

import { useEffect, useRef, useState } from 'react';
import { MessageEnvelope } from '@digitaldefiance/eecp-protocol';
import './MessageFlow.css';

interface MessageFlowProps {
  messages: Array<{
    direction: 'client->server' | 'server->client';
    envelope: MessageEnvelope;
    timestamp: number;
  }>;
}

interface AnimatedMessage {
  id: string;
  direction: 'client->server' | 'server->client';
  type: string;
  progress: number;
  timestamp: number;
}

export default function MessageFlow({ messages }: MessageFlowProps) {
  const [animatedMessages, setAnimatedMessages] = useState<AnimatedMessage[]>([]);
  const animationFrameRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Add new messages to animation queue
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      const newAnimatedMessage: AnimatedMessage = {
        id: crypto.randomUUID(),
        direction: latestMessage.direction,
        type: latestMessage.envelope.type,
        progress: 0,
        timestamp: latestMessage.timestamp,
      };

      setAnimatedMessages((prev) => [...prev, newAnimatedMessage]);
    }
  }, [messages]);

  useEffect(() => {
    // Animate messages
    const animate = () => {
      setAnimatedMessages((prev) => {
        const updated = prev.map((msg) => ({
          ...msg,
          progress: Math.min(msg.progress + 0.02, 1),
        }));

        // Remove completed animations
        return updated.filter((msg) => msg.progress < 1);
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <div className="message-flow">
      <div className="flow-container">
        <div className="flow-endpoint client">
          <div className="endpoint-icon">👤</div>
          <div className="endpoint-label">Client</div>
        </div>

        <div className="flow-path">
          <svg className="flow-svg" viewBox="0 0 400 100">
            {/* Path line */}
            <line
              x1="50"
              y1="50"
              x2="350"
              y2="50"
              stroke="#e5e7eb"
              strokeWidth="2"
              strokeDasharray="5,5"
            />

            {/* Animated messages */}
            {animatedMessages.map((msg) => {
              const x = msg.direction === 'client->server'
                ? 50 + (msg.progress * 300)
                : 350 - (msg.progress * 300);

              return (
                <g key={msg.id}>
                  <circle
                    cx={x}
                    cy="50"
                    r="8"
                    fill={msg.direction === 'client->server' ? '#3b82f6' : '#10b981'}
                    opacity={1 - msg.progress * 0.5}
                  />
                  <text
                    x={x}
                    y="30"
                    textAnchor="middle"
                    fontSize="10"
                    fill="#666"
                  >
                    {msg.type}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="flow-endpoint server">
          <div className="endpoint-icon">🖥️</div>
          <div className="endpoint-label">Server</div>
        </div>
      </div>

      <div className="flow-legend">
        <div className="legend-item">
          <div className="legend-dot client-to-server"></div>
          <span>Client → Server</span>
        </div>
        <div className="legend-item">
          <div className="legend-dot server-to-client"></div>
          <span>Server → Client</span>
        </div>
      </div>
    </div>
  );
}
