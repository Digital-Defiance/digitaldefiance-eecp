/**
 * Rich Text Editor Component
 * 
 * Simple text editor that converts text changes to CRDT operations.
 * Handles insert and delete operations.
 * 
 * Note: This is a simplified implementation using a textarea.
 * A full implementation would integrate Quill or similar rich text editor.
 * 
 * Requirements: 14.1
 */

import { useRef, useEffect, useState } from 'react';

interface RichTextEditorProps {
  text: string;
  onInsert: (position: number, text: string) => void;
  onDelete: (position: number, length: number) => void;
}

export function RichTextEditor({ text, onInsert, onDelete }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localText, setLocalText] = useState(text);
  const [cursorPosition, setCursorPosition] = useState(0);

  // Update local text when remote changes arrive
  useEffect(() => {
    if (text !== localText) {
      setLocalText(text);
      
      // Restore cursor position if possible
      if (textareaRef.current) {
        const newPosition = Math.min(cursorPosition, text.length);
        textareaRef.current.setSelectionRange(newPosition, newPosition);
      }
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    const textarea = e.target;
    const position = textarea.selectionStart || 0;

    // Save cursor position
    setCursorPosition(position);

    // Determine what changed
    if (newText.length > localText.length) {
      // Text was inserted
      const insertPosition = position - (newText.length - localText.length);
      const insertedText = newText.slice(insertPosition, position);
      onInsert(insertPosition, insertedText);
    } else if (newText.length < localText.length) {
      // Text was deleted
      const deleteLength = localText.length - newText.length;
      onDelete(position, deleteLength);
    }

    setLocalText(newText);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Save cursor position on any key press
    if (textareaRef.current) {
      setCursorPosition(textareaRef.current.selectionStart || 0);
    }
  };

  return (
    <div style={{ 
      flex: 1, 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Toolbar */}
      <div style={{
        padding: '0.5rem 1rem',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6',
        display: 'flex',
        gap: '0.5rem'
      }}>
        <button
          style={{
            padding: '0.25rem 0.5rem',
            backgroundColor: 'white',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Bold (not implemented)"
        >
          <strong>B</strong>
        </button>
        <button
          style={{
            padding: '0.25rem 0.5rem',
            backgroundColor: 'white',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Italic (not implemented)"
        >
          <em>I</em>
        </button>
        <button
          style={{
            padding: '0.25rem 0.5rem',
            backgroundColor: 'white',
            border: '1px solid #dee2e6',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
          title="Underline (not implemented)"
        >
          <u>U</u>
        </button>
        <div style={{ 
          marginLeft: 'auto', 
          padding: '0.25rem 0.5rem',
          color: '#6c757d'
        }}>
          {localText.length} characters
        </div>
      </div>

      {/* Editor */}
      <textarea
        ref={textareaRef}
        value={localText}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Start typing to collaborate..."
        style={{
          flex: 1,
          padding: '1rem',
          border: 'none',
          outline: 'none',
          resize: 'none',
          fontFamily: 'monospace',
          fontSize: '1rem',
          lineHeight: '1.5'
        }}
      />
    </div>
  );
}
