/**
 * Unit tests for ParticipantSidebar component
 * 
 * Tests:
 * - Participant list rendering
 * - Role display
 * - Online status indicators
 * 
 * Requirements: 14.2
 */

import { render, screen } from '@testing-library/react';
import { ParticipantSidebar } from './ParticipantSidebar';
import { ParticipantInfo } from '@digitaldefiance-eecp/eecp-protocol';

describe('ParticipantSidebar', () => {
  it('should render empty state when no participants', () => {
    render(<ParticipantSidebar participants={[]} />);

    expect(screen.getByText('Participants')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('No participants yet')).toBeInTheDocument();
  });

  it('should render participant list with correct count', () => {
    const participants: ParticipantInfo[] = [
      {
        id: 'participant-1',
        publicKey: Buffer.from('key1'),
        joinedAt: Date.now(),
        role: 'creator',
      },
      {
        id: 'participant-2',
        publicKey: Buffer.from('key2'),
        joinedAt: Date.now(),
        role: 'editor',
      },
    ];

    render(<ParticipantSidebar participants={participants} />);

    expect(screen.getByText('Participants')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('should display participant IDs (truncated)', () => {
    const participants: ParticipantInfo[] = [
      {
        id: 'participant-1-long-id',
        publicKey: Buffer.from('key1'),
        joinedAt: Date.now(),
        role: 'creator',
      },
    ];

    render(<ParticipantSidebar participants={participants} />);

    // Should show first 8 characters followed by ellipsis
    expect(screen.getByText('particip...')).toBeInTheDocument();
  });

  it('should display participant roles', () => {
    const participants: ParticipantInfo[] = [
      {
        id: 'participant-1',
        publicKey: Buffer.from('key1'),
        joinedAt: Date.now(),
        role: 'creator',
      },
      {
        id: 'participant-2',
        publicKey: Buffer.from('key2'),
        joinedAt: Date.now(),
        role: 'editor',
      },
      {
        id: 'participant-3',
        publicKey: Buffer.from('key3'),
        joinedAt: Date.now(),
        role: 'viewer',
      },
    ];

    render(<ParticipantSidebar participants={participants} />);

    expect(screen.getByText('creator')).toBeInTheDocument();
    expect(screen.getByText('editor')).toBeInTheDocument();
    expect(screen.getByText('viewer')).toBeInTheDocument();
  });

  it('should display role icons', () => {
    const participants: ParticipantInfo[] = [
      {
        id: 'participant-1',
        publicKey: Buffer.from('key1'),
        joinedAt: Date.now(),
        role: 'creator',
      },
    ];

    const { container } = render(<ParticipantSidebar participants={participants} />);

    // Check for crown emoji (creator icon)
    expect(container.textContent).toContain('👑');
  });

  it('should show online status for all participants', () => {
    const participants: ParticipantInfo[] = [
      {
        id: 'participant-1',
        publicKey: Buffer.from('key1'),
        joinedAt: Date.now(),
        role: 'creator',
      },
      {
        id: 'participant-2',
        publicKey: Buffer.from('key2'),
        joinedAt: Date.now(),
        role: 'editor',
      },
    ];

    const { container } = render(<ParticipantSidebar participants={participants} />);

    // Check for online status indicators (green dots)
    const statusIndicators = container.querySelectorAll('[title="Online"]');
    expect(statusIndicators).toHaveLength(2);
  });

  it('should display footer message', () => {
    const participants: ParticipantInfo[] = [
      {
        id: 'participant-1',
        publicKey: Buffer.from('key1'),
        joinedAt: Date.now(),
        role: 'creator',
      },
    ];

    render(<ParticipantSidebar participants={participants} />);

    expect(screen.getByText('All participants are online')).toBeInTheDocument();
  });
});
