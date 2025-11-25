import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { FaGithub, FaStar, FaCode, FaExternalLinkAlt } from 'react-icons/fa';
import { SiNpm } from 'react-icons/si';
import './Components.css';

interface Component {
  title: string;
  description: string;
  icon: string;
  tech: string[];
  github: string;
  projectUrl?: string;
  npm?: string;
  stats?: {
    tests?: string;
    coverage?: string;
  };
  highlights: string[];
  category: 'Core' | 'Crypto' | 'Server' | 'Client' | 'Tools';
}

const components: Component[] = [
  {
    title: 'eecp-protocol',
    icon: '📋',
    description:
      'Core types and protocol definitions for EECP. Defines workspace configuration, encrypted operations, WebSocket message envelopes, and all shared interfaces used across the system.',
    tech: ['TypeScript', 'Protocol Definitions', 'Type Safety'],
    github:
      'https://github.com/Digital-Defiance/eecp-lib/tree/main/packages/eecp-protocol',
    category: 'Core',
    highlights: [
      'WorkspaceId, ParticipantId, OperationId type definitions',
      'TimeWindow and temporal key scheduling interfaces',
      'EncryptedOperation and CRDT operation structures',
      'WebSocket message envelopes and protocol types',
      'Shared interfaces for workspace metadata and configuration',
    ],
  },
  {
    title: 'eecp-crypto',
    icon: '🔐',
    description:
      'Temporal key management and encryption primitives. Implements HKDF key derivation, AES-256-GCM encryption, ECIES multi-recipient encryption, zero-knowledge authentication, and cryptographic commitments for provable key deletion.',
    tech: ['TypeScript', 'HKDF', 'AES-256-GCM', 'ECIES', 'ECDSA'],
    github:
      'https://github.com/Digital-Defiance/eecp-lib/tree/main/packages/eecp-crypto',
    category: 'Crypto',
    stats: {
      tests: '100+ property tests',
    },
    highlights: [
      'Temporal key derivation with HKDF-SHA256',
      'Time-locked encryption with AES-256-GCM',
      'Multi-recipient encryption using @digitaldefiance/ecies-lib',
      'Zero-knowledge participant authentication with ECDSA',
      'Cryptographic commitments for provable key deletion',
    ],
  },
  {
    title: 'eecp-crdt',
    icon: '🔄',
    description:
      'Encrypted conflict-free replicated data types for collaborative editing. Built on Yjs for deterministic conflict resolution with encrypted content payloads, operation encryption/decryption, and temporal garbage collection.',
    tech: ['TypeScript', 'Yjs', 'CRDT', 'Encryption'],
    github:
      'https://github.com/Digital-Defiance/eecp-lib/tree/main/packages/eecp-crdt',
    category: 'Core',
    stats: {
      tests: '50+ tests',
    },
    highlights: [
      'Yjs-based text CRDT with encrypted operations',
      'Insert, delete, and format operations with encryption',
      'Deterministic conflict resolution for concurrent edits',
      'Operation encryption with temporal keys',
      'Temporal garbage collection for expired operations',
    ],
  },
  {
    title: 'eecp-server',
    icon: '⚡',
    description:
      'Express + WebSocket server for zero-knowledge operation routing. Manages workspace lifecycle, participant authentication, encrypted operation broadcasting, rate limiting, and temporal cleanup with Prometheus metrics.',
    tech: ['Express 5', 'WebSocket', 'Node.js', 'Prometheus'],
    github:
      'https://github.com/Digital-Defiance/eecp-lib/tree/main/packages/eecp-server',
    category: 'Server',
    stats: {
      tests: '200+ tests',
    },
    highlights: [
      'REST API for workspace creation, extension, and revocation',
      'WebSocket server for real-time operation streaming',
      'Zero-knowledge participant authentication',
      'Operation routing and buffering for offline participants',
      'Rate limiting, audit logging, and Prometheus metrics',
    ],
  },
  {
    title: 'eecp-client',
    icon: '💻',
    description:
      'Browser client library with React hooks for collaborative editing. Provides WebSocket connection management, key storage in IndexedDB, collaborative editor with change subscriptions, and automatic reconnection with exponential backoff.',
    tech: ['TypeScript', 'React 19', 'WebSocket', 'IndexedDB'],
    github:
      'https://github.com/Digital-Defiance/eecp-lib/tree/main/packages/eecp-client',
    category: 'Client',
    stats: {
      tests: '150+ tests',
    },
    highlights: [
      'EECPClient with WebSocket connection management',
      'ClientKeyManager with IndexedDB storage',
      'CollaborativeEditor with real-time change subscriptions',
      'React hooks: useWorkspace, useCollaboration',
      'Automatic reconnection with exponential backoff',
    ],
  },
  {
    title: 'eecp-cli',
    icon: '🖥️',
    description:
      'Command-line interface for testing and automation. Create workspaces, join sessions, export documents, and interact with EECP from the terminal with a full-featured interactive editor.',
    tech: ['TypeScript', 'Commander.js', 'Node.js'],
    github:
      'https://github.com/Digital-Defiance/eecp-lib/tree/main/packages/eecp-cli',
    category: 'Tools',
    highlights: [
      'Create workspaces with configurable duration',
      'Join workspaces with ID and key',
      'Interactive terminal-based collaborative editor',
      'Export documents to plaintext files',
      'List active workspaces and participants',
    ],
  },
  {
    title: 'eecp-demo',
    icon: '🎨',
    description:
      'Reference web application demonstrating EECP capabilities. Features rich text editing with Quill, participant sidebar, countdown timer, shareable links, and document export functionality.',
    tech: ['React 19', 'Vite', 'Quill', 'Material-UI'],
    github:
      'https://github.com/Digital-Defiance/eecp-lib/tree/main/packages/eecp-demo',
    category: 'Client',
    highlights: [
      'Rich text editor with formatting controls',
      'Participant list with online status indicators',
      'Countdown timer showing workspace expiration',
      'Shareable link generation with embedded credentials',
      'Document export to plaintext',
    ],
  },
];

const Components = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1,
  });

  return (
    <section className="components section" id="components" ref={ref}>
      <motion.div
        className="components-container"
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6 }}
      >
        <h2 className="section-title">
          The <span className="gradient-text">Complete</span> System
        </h2>
        <p className="components-subtitle">
          A comprehensive TypeScript monorepo providing everything you need for
          ephemeral encrypted collaboration with zero-knowledge guarantees
        </p>

        <motion.div
          className="suite-intro"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h3>
            What if you could collaborate in real-time with <em>cryptographic guarantees</em> that content becomes <em>unreadable after expiration</em>?
          </h3>
          <p>
            <strong>
              EECP is a zero-knowledge, self-destructing collaborative workspace system.
            </strong>{' '}
            This isn't just another collaboration tool—it's a complete cryptographic protocol that
            enables real-time document editing with{' '}
            <strong>temporal encryption</strong>,{' '}
            <strong>zero-knowledge servers</strong>, and{' '}
            <strong>provable key deletion</strong>.
          </p>
          <div className="problem-solution">
            <div className="problem">
              <h4>❌ The Problem: Collaboration Requires Trust</h4>
              <ul>
                <li>Traditional collaboration tools can read your content</li>
                <li>Deleted content may persist in backups indefinitely</li>
                <li>Server operators have access to plaintext data</li>
                <li>No cryptographic guarantees of data destruction</li>
                <li>Privacy depends on trusting the service provider</li>
              </ul>
              <p>
                <strong>Result:</strong> Sensitive collaboration requires trusting third parties with your data.
              </p>
            </div>
            <div className="solution">
              <h4>✅ The Solution: Zero-Knowledge Ephemeral Collaboration</h4>
              <p>
                <strong>EECP</strong> provides{' '}
                <strong>7 integrated packages</strong> that work together
                to enable secure collaboration: protocol definitions (eecp-protocol),
                cryptographic primitives (eecp-crypto), encrypted CRDTs (eecp-crdt),
                zero-knowledge server (eecp-server), browser client (eecp-client),
                CLI tools (eecp-cli), and demo application (eecp-demo).
              </p>
              <p>
                Built with TypeScript and extensively tested with{' '}
                <strong>property-based testing</strong>, these packages provide{' '}
                <strong>temporal key rotation</strong>,{' '}
                <strong>zero-knowledge authentication</strong>, and{' '}
                <strong>cryptographic commitments</strong> for provable key deletion.
                The server never sees plaintext content and cannot decrypt operations.
              </p>
            </div>
          </div>
          <div className="value-props">
            <div className="value-prop">
              <strong>🔐 Zero-Knowledge</strong>
              <p>
                Server routes encrypted operations without ever seeing plaintext content
              </p>
            </div>
            <div className="value-prop">
              <strong>⏰ Temporal Encryption</strong>
              <p>
                Time-bound keys automatically rotate and are destroyed on schedule
              </p>
            </div>
            <div className="value-prop">
              <strong>🤝 Real-Time CRDT</strong>
              <p>
                Yjs-based conflict-free editing with encrypted operation payloads
              </p>
            </div>
            <div className="value-prop">
              <strong>🔍 Provable Deletion</strong>
              <p>
                Cryptographic commitments prove that keys were destroyed as scheduled
              </p>
            </div>
          </div>
        </motion.div>

        <div className="components-grid">
          {components.map((component, index) => (
            <motion.div
              key={component.title}
              className="component-card card"
              initial={{ opacity: 0, y: 50 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: index * 0.1, duration: 0.6 }}
            >
              <div className="component-header">
                <div className="component-icon">{component.icon}</div>
                <h3>{component.title}</h3>
                <span
                  className={`component-badge ${component.category.toLowerCase()}`}
                >
                  {component.category}
                </span>
              </div>

              <p className="component-description">{component.description}</p>

              {component.stats && (
                <div className="component-stats">
                  {component.stats.tests && (
                    <div className="stat">
                      <FaCode />
                      <span>{component.stats.tests}</span>
                    </div>
                  )}
                  {component.stats.coverage && (
                    <div className="stat">
                      <FaStar />
                      <span>{component.stats.coverage} coverage</span>
                    </div>
                  )}
                </div>
              )}

              <ul className="component-highlights">
                {component.highlights.map((highlight, i) => (
                  <li key={i}>{highlight}</li>
                ))}
              </ul>

              <div className="component-tech">
                {component.tech.map((tech) => (
                  <span key={tech} className="tech-badge">
                    {tech}
                  </span>
                ))}
              </div>

              <div className="component-links">
                <a
                  href={component.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="component-link"
                >
                  <FaGithub />
                  GitHub
                </a>
                {component.projectUrl && (
                  <a
                    href={component.projectUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="component-link"
                  >
                    <FaExternalLinkAlt />
                    Project Site
                  </a>
                )}
                {component.npm && (
                  <a
                    href={component.npm}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="component-link"
                  >
                    <SiNpm />
                    NPM
                  </a>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </section>
  );
};

export default Components;
