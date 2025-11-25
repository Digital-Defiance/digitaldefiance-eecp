/**
 * Main Application Component
 * 
 * Sets up React Router with routes for:
 * - Home page
 * - Create workspace
 * - Join workspace
 * - Workspace view
 * 
 * Requirements: 14.1
 */

import { Route, Routes } from 'react-router-dom';
import { HomePage } from './components/HomePage';
import { CreateWorkspace } from './components/CreateWorkspace';
import { JoinWorkspace } from './components/JoinWorkspace';
import { WorkspaceView } from './components/WorkspaceView';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/create" element={<CreateWorkspace />} />
      <Route path="/join/:id" element={<JoinWorkspace />} />
      <Route path="/workspace/:id" element={<WorkspaceView />} />
    </Routes>
  );
}

export default App;
