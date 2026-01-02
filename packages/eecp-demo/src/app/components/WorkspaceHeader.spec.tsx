/**
 * Unit tests for WorkspaceHeader component
 * 
 * Tests:
 * - Countdown timer display
 * - Share button functionality
 * - Export button functionality
 * 
 * Requirements: 14.3
 */

import { render, screen, fireEvent, act } from '@testing-library/react';
import { WorkspaceHeader } from './WorkspaceHeader';
import { IWorkspaceClient } from '@digitaldefiance/eecp-client';

// Mock workspace client
const createMockWorkspace = (expiresAt: number): IWorkspaceClient => ({
  getMetadata: () => ({
    config: {
      id: 'test-workspace-id',
      createdAt: Date.now() - 60000,
      expiresAt,
      timeWindow: {
        startTime: Date.now() - 60000,
        endTime: expiresAt,
        rotationInterval: 15,
        gracePeriod: 60000,
      },
      maxParticipants: 50,
      allowExtension: false,
    },
    participants: [],
    currentTemporalKeyId: 'key-1',
    keyRotationSchedule: {
      currentKeyId: 'key-1',
      nextRotationAt: Date.now() + 300000,
    },
  }),
  getEditor: jest.fn(),
  getParticipants: jest.fn().mockReturnValue([]),
  leave: jest.fn(),
  exportDocument: jest.fn().mockReturnValue('Test document content'),
});

// Mock clipboard API
Object.assign(navigator, {
  clipboard: {
    writeText: jest.fn().mockResolvedValue(undefined),
  },
});

// Mock alert
global.alert = jest.fn();

describe('WorkspaceHeader', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should render workspace header with countdown timer', () => {
    const expiresAt = Date.now() + 300000; // 5 minutes from now
    const workspace = createMockWorkspace(expiresAt);

    render(<WorkspaceHeader workspace={workspace} />);

    expect(screen.getByText('EECP Workspace')).toBeInTheDocument();
    expect(screen.getByText(/⏱️/)).toBeInTheDocument();
  });

  it('should update countdown timer every second', () => {
    const expiresAt = Date.now() + 120000; // 2 minutes from now
    const workspace = createMockWorkspace(expiresAt);

    render(<WorkspaceHeader workspace={workspace} />);

    // Initial time should be around 2:00
    expect(screen.getByText(/2:00|1:59/)).toBeInTheDocument();

    // Advance time by 1 second
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    // Time should have decreased
    expect(screen.getByText(/1:59|1:58/)).toBeInTheDocument();
  });

  it('should show warning color when expiring soon', () => {
    const expiresAt = Date.now() + 30000; // 30 seconds from now
    const workspace = createMockWorkspace(expiresAt);

    const { container } = render(<WorkspaceHeader workspace={workspace} />);

    // Find all elements with background in style and look for the countdown specifically
    const elementsWithBackground = container.querySelectorAll('[style*="background"]');
    
    // The countdown timer should be one of these elements with the warning color
    let foundWarningColor = false;
    elementsWithBackground.forEach(el => {
      const style = el.getAttribute('style');
      if (style?.includes('#dc3545') || style?.includes('rgb(220, 53, 69)')) {
        foundWarningColor = true;
      }
    });
    
    expect(foundWarningColor).toBe(true);
  });

  it('should copy share link to clipboard on share button click', async () => {
    const workspace = createMockWorkspace(Date.now() + 300000);

    render(<WorkspaceHeader workspace={workspace} />);

    const shareButton = screen.getByRole('button', { name: /share/i });
    fireEvent.click(shareButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/join/test-workspace-id')
    );
  });

  it('should call exportDocument when export button is clicked', () => {
    const workspace = createMockWorkspace(Date.now() + 300000);

    // Mock URL and Blob APIs
    global.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = jest.fn();

    render(<WorkspaceHeader workspace={workspace} />);

    const exportButton = screen.getByRole('button', { name: /export/i });
    
    // The export will fail in JSDOM due to DOM manipulation, but we can verify the method was called
    try {
      fireEvent.click(exportButton);
    } catch (error) {
      // Expected to fail in JSDOM environment
    }

    // Verify exportDocument was called
    expect(workspace.exportDocument).toHaveBeenCalled();
  });
});
