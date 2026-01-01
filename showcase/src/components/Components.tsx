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
  category: 'Core' | 'Crypto' | 'UI' | 'Tools' | 'Testing';
}

const components: Component[] = [
  {
    title: 'i18n-lib',
    icon: '🌍',
    description:
      'Production-ready internationalization library with component-based architecture, type-safe translations, ICU MessageFormat support, and comprehensive security features including XSS protection and ReDoS mitigation.',
    tech: ['TypeScript', 'ICU MessageFormat', 'CLDR', 'Security'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-i18n-lib',
    projectUrl: 'https://digital-defiance.github.io/i18n-lib/',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/i18n-lib',
    category: 'Core',
    stats: {
      tests: '1,738 tests',
      coverage: '93.22%',
    },
    highlights: [
      '37 language support with CLDR-compliant plural rules',
      'ICU MessageFormat: plural, select, date/time/number formatting',
      'Production-grade security: XSS, ReDoS, prototype pollution protection',
      'Component registration with aliases and full type safety',
      'Multiple isolated engine instances for different contexts',
    ],
  },
  {
    title: 'ecies-lib',
    icon: '🔐',
    description:
      'Browser-compatible ECIES v4.0 encryption library built on Web Crypto API and @noble/curves. Features HKDF key derivation, AAD binding, multi-recipient optimization, BIP39 mnemonics, and HD wallets.',
    tech: ['TypeScript', 'Web Crypto API', '@noble/curves', 'secp256k1'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-ecies-lib',
    projectUrl: 'https://digital-defiance.github.io/ecies-lib/',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/ecies-lib',
    category: 'Crypto',
    stats: {
      tests: '1,200+ tests',
    },
    highlights: [
      'ECIES v4.0: HKDF-SHA256 key derivation & AAD binding',
      'AES-256-GCM with secp256k1 ECDH & ECDSA',
      'Pluggable ID providers (ObjectId, GUID, UUID, custom)',
      'BIP39 mnemonics & BIP32/BIP44 HD wallet derivation',
      'Memory-efficient streaming for large files (<10MB RAM)',
    ],
  },
  {
    title: 'node-ecies-lib',
    icon: '🔑',
    description:
      'Node.js ECIES implementation with strict binary compatibility to ecies-lib. Enables seamless cross-platform encryption between browser and Node.js using native crypto primitives.',
    tech: ['TypeScript', 'Node.js Crypto', 'HKDF', 'PBKDF2'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-node-ecies-lib',
    projectUrl: 'https://digital-defiance.github.io/node-ecies-lib/',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/node-ecies-lib',
    category: 'Crypto',
    stats: {
      tests: '220+ tests',
    },
    highlights: [
      'Binary compatible with browser ecies-lib (same version)',
      'ECIES v4.0 protocol with Node.js crypto',
      'Multi-recipient encryption with shared ephemeral key',
      'Member system with integrated cryptographic operations',
      'Streaming encryption for gigabyte-sized files',
    ],
  },
  {
    title: 'suite-core-lib',
    icon: '🏗️',
    description:
      'Foundation library providing cryptographically-secure user management, RBAC with fine-grained permissions, zero-knowledge authentication flows, and localized error handling in multiple languages.',
    tech: ['TypeScript', 'RBAC', 'Zero-Knowledge Proofs', 'i18n'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-suite-core-lib',
    projectUrl: 'https://digital-defiance.github.io/suite-core-lib/',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/suite-core-lib',
    category: 'Core',
    highlights: [
      'Type-safe interfaces for frontend & backend user models',
      'Role-based access control with permission management',
      'Cryptographically secure backup code generation',
      'Fluent builder APIs for users and roles',
      'Localized errors in English, French, Spanish, Chinese, Ukrainian',
    ],
  },
  {
    title: 'node-express-suite',
    icon: '⚡',
    description:
      'Complete Express 5 framework with JWT authentication, RBAC middleware, MongoDB/Mongoose integration, email token workflows, dynamic model registry, and i18n support. Out-of-the-box MERN solution.',
    tech: ['Express 5', 'JWT', 'MongoDB', 'Mongoose', 'EJS'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-node-express-suite',
    projectUrl: 'https://digital-defiance.github.io/node-express-suite/',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/node-express-suite',
    category: 'Core',
    stats: {
      tests: '604 tests',
      coverage: '57.86%',
    },
    highlights: [
      'JWT authentication with encrypted tokens',
      'Email verification, password reset, and recovery workflows',
      'Dynamic model registry for extensible schemas',
      'ECIES encryption & PBKDF2 key derivation integration',
      'Built-in user, role, and token models',
    ],
  },
  {
    title: 'express-suite-react-components',
    icon: '⚛️',
    description:
      'Production-ready React 19 + Material-UI component library. Includes authentication forms, route guards, hooks, context providers, theme management, and pre-configured wrappers for rapid integration.',
    tech: ['React 19', 'Material-UI', 'TypeScript', 'Hooks'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-express-suite-react-components',
    projectUrl: 'https://digital-defiance.github.io/react-components/',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/express-suite-react-components',
    category: 'UI',
    highlights: [
      'Auth components: login, register, password reset, backup codes',
      'Route guards: PrivateRoute, UnAuthRoute, conditional rendering',
      'Hooks: useAuth, useI18n, useUserSettings, useBackupCodes',
      'Providers: AuthProvider, I18nProvider, AppThemeProvider',
      'Pre-configured wrappers for seamless context integration',
    ],
  },
  {
    title: 'mongoose-types',
    icon: '📊',
    description:
      'Custom TypeScript type definitions for Mongoose 8.x enabling flexible _id types beyond ObjectId. Supports strings, UUIDs, GUIDs, and custom ID formats for cross-platform database migrations.',
    tech: ['TypeScript', 'Mongoose 8.x', 'Type Definitions'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-mongoose-types',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/mongoose-types',
    category: 'Tools',
    highlights: [
      'Flexible Document<T> generic with any ID type',
      'String-based IDs (UUID, GUID, custom formats)',
      'Drop-in replacement via tsconfig.json paths',
      'Full Mongoose 8.x API compatibility',
      'Ideal for SQL → MongoDB migrations',
    ],
  },
  {
    title: 'express-suite-test-utils',
    icon: '🧪',
    description:
      'Comprehensive testing toolkit with custom Jest matchers, console/localStorage mocks, in-memory MongoDB, BSON mocks, React testing utilities, and package-specific /testing entry points.',
    tech: ['Jest', 'Testing Library', 'MongoDB Memory Server', 'Faker'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-express-suite-test-utils',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/express-suite-test-utils',
    category: 'Testing',
    highlights: [
      'toThrowType matcher for type-safe error testing',
      'Console mocks with spyContains helper',
      'In-memory MongoDB for isolated integration tests',
      'Package-specific helpers via /testing entry points',
      'Requires @faker-js/faker for data generation',
    ],
  },
  {
    title: 'express-suite-starter',
    icon: '🚀',
    description:
      'Automated MERN monorepo generator with interactive CLI. Creates Nx-powered workspaces with React 19, Express 5, MongoDB, Material-UI, DevContainer support, Mustache templates, and comprehensive project scaffolding.',
    tech: ['Nx', 'Mustache', 'Chalk', 'Inquirer', 'Plugins'],
    github:
      'https://github.com/Digital-Defiance/express-suite/tree/main/packages/digitaldefiance-express-suite-starter',
    npm: 'https://www.npmjs.com/package/@digitaldefiance/express-suite-starter',
    category: 'Tools',
    highlights: [
      'Interactive CLI with 19-step generation process',
      'Package groups: authentication, validation, documentation',
      'DevContainer options: None, Simple, MongoDB, Replica Set',
      'Auto-generates JWT secrets and encryption keys',
      'Rollback support with checkpoint/restore',
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
          The <span className="gradient-text">Complete</span> Solution
        </h2>
        <p className="components-subtitle">
          A comprehensive TypeScript monorepo providing everything you need for
          secure, scalable, internationalized MERN applications
        </p>

        <motion.div
          className="suite-intro"
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <h3>
            What if you could build <em>secure</em>, <em>internationalized</em>,{' '}
            and <em>production-ready</em> applications in record time?
          </h3>
          <p>
            <strong>
              Express Suite is the most comprehensive TypeScript monorepo for
              building modern MERN applications.
            </strong>{' '}
            This isn't just another boilerplate—it's a complete ecosystem that
            transforms full-stack development with{' '}
            <strong>enterprise-grade encryption</strong>,{' '}
            <strong>multi-language support</strong>, and{' '}
            <strong>battle-tested authentication</strong>.
          </p>
          <div className="problem-solution">
            <div className="problem">
              <h4>❌ The Problem: Building Secure Apps Is Complex</h4>
              <ul>
                <li>Cryptography libraries are hard to use correctly</li>
                <li>Internationalization is often an afterthought</li>
                <li>Authentication and RBAC require extensive boilerplate</li>
                <li>Integrating frontend and backend is time-consuming</li>
                <li>Testing secure systems is challenging</li>
              </ul>
              <p>
                <strong>Result:</strong> You spend months building
                infrastructure instead of features.
              </p>
            </div>
            <div className="solution">
              <h4>✅ The Solution: Complete Integrated Development Platform</h4>
              <p>
                <strong>Express Suite</strong> provides{' '}
                <strong>9 production-ready packages</strong> that work together
                seamlessly: cryptography libraries (ecies-lib, node-ecies-lib),
                core infrastructure (suite-core-lib, node-express-suite), UI
                components (express-suite-react-components),
                internationalization (i18n-lib), testing utilities, project
                generator, and flexible Mongoose types.
              </p>
              <p>
                Built with TypeScript and exhaustively tested (
                <strong>over 2,000 tests across all packages</strong>), these
                libraries are production-ready and used in real-world
                applications. They provide{' '}
                <strong>binary-compatible encryption</strong> between browser
                and Node.js, <strong>37-language support</strong>, and{' '}
                <strong>zero-knowledge authentication</strong>.
              </p>
            </div>
          </div>
          <div className="value-props">
            <div className="value-prop">
              <strong>🚀 Rapid Development</strong>
              <p>
                Generator creates complete MERN monorepos with Nx, DevContainer
                support, and modern tooling
              </p>
            </div>
            <div className="value-prop">
              <strong>🔐 Security First</strong>
              <p>
                ECIES v4.0 encryption, JWT authentication, PBKDF2 key
                derivation, and comprehensive security testing
              </p>
            </div>
            <div className="value-prop">
              <strong>🌐 Global Ready</strong>
              <p>
                8 built-in languages with support for 37 total, ICU
                MessageFormat, and type-safe translations
              </p>
            </div>
            <div className="value-prop">
              <strong>🏢 Production Tested</strong>
              <p>
                2,000+ tests, extensive documentation, and real-world usage in
                production applications
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
