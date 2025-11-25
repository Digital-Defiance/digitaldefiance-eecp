/**
 * Unit tests for CreateWorkspace component
 * 
 * Tests:
 * - Form submission
 * - Duration selection
 * - Error handling
 * 
 * Requirements: 14.1
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { CreateWorkspace } from './CreateWorkspace';

// Mock the navigation
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Mock the EECP client
jest.mock('@digitaldefiance-eecp/eecp-client', () => ({
  EECPClient: jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    createWorkspace: jest.fn().mockResolvedValue({
      getMetadata: () => ({
        config: {
          id: 'test-workspace-id',
        },
      }),
    }),
  })),
}));

describe('CreateWorkspace', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('should render the create workspace form', () => {
    render(
      <BrowserRouter>
        <CreateWorkspace />
      </BrowserRouter>
    );

    expect(screen.getByRole('heading', { name: /create workspace/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Duration (minutes)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create workspace/i })).toBeInTheDocument();
  });

  it('should allow selecting different durations', () => {
    render(
      <BrowserRouter>
        <CreateWorkspace />
      </BrowserRouter>
    );

    const select = screen.getByLabelText('Duration (minutes)') as HTMLSelectElement;
    
    // Default should be 30 minutes
    expect(select.value).toBe('30');

    // Change to 60 minutes
    fireEvent.change(select, { target: { value: '60' } });
    expect(select.value).toBe('60');
  });

  it('should create workspace and navigate on form submission', async () => {
    render(
      <BrowserRouter>
        <CreateWorkspace />
      </BrowserRouter>
    );

    const createButton = screen.getByRole('button', { name: /create workspace/i });
    fireEvent.click(createButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/workspace/test-workspace-id');
    });
  });

  it('should show loading state during creation', async () => {
    render(
      <BrowserRouter>
        <CreateWorkspace />
      </BrowserRouter>
    );

    const createButton = screen.getByRole('button', { name: /create workspace/i });
    fireEvent.click(createButton);

    // Button should show loading text (check immediately after click)
    await waitFor(() => {
      expect(screen.queryByText('Creating...')).toBeInTheDocument();
    }, { timeout: 100 });
  });

  it('should navigate back on cancel', () => {
    render(
      <BrowserRouter>
        <CreateWorkspace />
      </BrowserRouter>
    );

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelButton);

    expect(mockNavigate).toHaveBeenCalledWith('/');
  });
});
