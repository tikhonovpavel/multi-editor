import React, { useState, useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-latex'; // Import LaTeX language support
import 'prismjs/components/prism-python'; // Import Python language support
import 'prismjs/components/prism-markdown'; // Import Markdown language support
import 'prismjs/themes/prism.css'; // Default Prism theme, you can choose others
import './App.css';

function App() {
  const [rawText, setRawText] = useState(''); // Stores plain text from left pane
  // highlightedLeft state is no longer needed for direct rendering of left pane
  const [highlightedRight, setHighlightedRight] = useState('');
  const [mode, setMode] = useState('latex'); // Current mode: 'latex', 'markdown', or 'python'
  const [removeAppendix, setRemoveAppendix] = useState(false); // State for appendix removal (LaTeX only)
  const [removeDocstrings, setRemoveDocstrings] = useState(false); // State for docstring removal (Python only)
  const [leftLineNumbers, setLeftLineNumbers] = useState('1');
  const [rightLineNumbers, setRightLineNumbers] = useState('1');

  const leftPaneRef = useRef(null);
  const rightPaneRef = useRef(null);
  const leftLineNumbersRef = useRef(null);
  const rightLineNumbersRef = useRef(null);
  const isSyncingScroll = useRef(false); // To prevent scroll event loops

  // Helper function to generate line numbers
  const generateLineNumbers = (text) => {
    if (!text) return '1';
    const lines = text.split('\n');
    return lines.map((_, index) => index + 1).join('\n');
  };

  const handleInputChange = (event) => {
    const editorDiv = leftPaneRef.current;
    if (!editorDiv) return;

    const currentText = editorDiv.innerText;

    setRawText(currentText);
    setLeftLineNumbers(generateLineNumbers(currentText));

    processOutput(currentText);
  };

  // Separated the processing logic for reusability
  const processOutput = (text) => {
    let processedText = text;
    
    // Remove comments based on mode
    if (mode === 'latex') {
      // Remove LaTeX comments (lines starting with % or text after % if not escaped)
      processedText = text.split('\n').map(line => {
        const commentIndex = line.indexOf('%');
        if (commentIndex !== -1 && (commentIndex === 0 || line[commentIndex - 1] !== '\\')) {
          return line.substring(0, commentIndex);
        }
        return line;
      }).join('\n');
      
      // Handle appendix removal if enabled (LaTeX only)
      if (removeAppendix) {
        const appendixIndex = processedText.indexOf('\\appendix');
        const endDocIndex = processedText.indexOf('\\end{document}');
        
        if (appendixIndex !== -1 && endDocIndex !== -1 && appendixIndex < endDocIndex) {
          processedText = 
            processedText.substring(0, appendixIndex) + 
            '\\appendix\n...\n' + 
            processedText.substring(endDocIndex);
        }
      }
    } else if (mode === 'python') {
      // Remove Python comments (lines starting with # or text after #)
      processedText = text.split('\n').map(line => {
        const commentIndex = line.indexOf('#');
        if (commentIndex !== -1) {
          // Check if # is inside a string
          const beforeHash = line.substring(0, commentIndex);
          const singleQuotes = (beforeHash.match(/'/g) || []).length;
          const doubleQuotes = (beforeHash.match(/"/g) || []).length;
          
          // Simple heuristic: if odd number of quotes, # is likely inside a string
          if (singleQuotes % 2 === 0 && doubleQuotes % 2 === 0) {
            return line.substring(0, commentIndex);
          }
        }
        return line;
      }).join('\n');
      
      // Remove docstrings if enabled
      if (removeDocstrings) {
        const lines = processedText.split('\n');
        const result = [];
        let i = 0;
        let afterDefOrClass = false;
        let inDefOrClassSignature = false; // Track if we're in a multi-line def/class signature
        let isModuleStart = true; // Track if we're at the beginning of the module
        
        while (i < lines.length) {
          const line = lines[i];
          const trimmed = line.trim();
          
          // Check if this line starts a def or class definition
          if (trimmed.startsWith('def ') || trimmed.startsWith('class ')) {
            result.push(line);
            isModuleStart = false;
            
            // Check if the definition ends on this line (ends with ':')
            if (trimmed.endsWith(':')) {
              afterDefOrClass = true;
              inDefOrClassSignature = false;
            } else {
              // Multi-line definition
              inDefOrClassSignature = true;
              afterDefOrClass = false;
            }
            i++;
            continue;
          }
          
          // If we're in a multi-line def/class signature, continue until we find ':'
          if (inDefOrClassSignature) {
            result.push(line);
            if (trimmed.endsWith(':')) {
              inDefOrClassSignature = false;
              afterDefOrClass = true;
            }
            i++;
            continue;
          }
          
          // Check if this is a docstring line (at module start or after def/class)
          const isDocstringStart = trimmed.startsWith('"""') || trimmed.startsWith("'''");
          
          if ((afterDefOrClass || isModuleStart) && isDocstringStart) {
            const quote = trimmed.startsWith('"""') ? '"""' : "'''";
            
            // Check if docstring ends on the same line
            const afterQuote = trimmed.substring(3);
            if (afterQuote.includes(quote)) {
              // Single-line docstring - skip it
              afterDefOrClass = false;
              i++;
              continue;
            }
            
            // Multi-line docstring - skip until we find the closing quotes
            i++;
            while (i < lines.length) {
              if (lines[i].includes(quote)) {
                i++;
                break;
              }
              i++;
            }
            afterDefOrClass = false;
            continue;
          }
          
          // If we see non-empty, non-comment line after def/class that's not a docstring, reset flag
          if (afterDefOrClass && trimmed && !trimmed.startsWith('#')) {
            afterDefOrClass = false;
          }
          
          // If we see any non-empty, non-comment line at module start, it's no longer module start
          if (isModuleStart && trimmed && !trimmed.startsWith('#')) {
            isModuleStart = false;
          }
          
          result.push(line);
          i++;
        }
        
        processedText = result.join('\n');
      }
    } else if (mode === 'markdown') {
      // Remove HTML-style comments in Markdown (<!-- comment -->)
      processedText = text.replace(/<!--[\s\S]*?-->/g, '');
    }
    
    processedText = processedText.replace(/\n{3,}/g, '\n\n');
    const language = Prism.languages[mode];
    const highlightedOutputForRight = Prism.highlight(processedText, language, mode);
    setHighlightedRight(highlightedOutputForRight);
    setRightLineNumbers(generateLineNumbers(processedText));
  };

  // Update output when removeAppendix, removeDocstrings, or mode changes
  useEffect(() => {
    if (rawText) {
      processOutput(rawText);
    }
  }, [removeAppendix, removeDocstrings, mode]); // Re-process when these options change

  useEffect(() => {
    // Initialize right pane or update if rawText was empty
    if (rawText) {
      processOutput(rawText);
    }
  }, []); // Run only on initial mount

  // Synchronized scrolling
  const handleScroll = (sourceRef, targetRef, sourceLineNumbersRef, targetLineNumbersRef) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    
    // Sync line numbers with source editor pane
    if (sourceRef.current && sourceLineNumbersRef.current) {
      sourceLineNumbersRef.current.scrollTop = sourceRef.current.scrollTop;
    }
    
    // Sync with opposite pane
    if (sourceRef.current && targetRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = sourceRef.current;
      const scrollableHeight = scrollHeight - clientHeight;
      if (scrollableHeight > 0) {
          const scrollRatio = scrollTop / scrollableHeight;
          targetRef.current.scrollTop = scrollRatio * (targetRef.current.scrollHeight - targetRef.current.clientHeight);
          
          // Sync target line numbers
          if (targetLineNumbersRef.current) {
            targetLineNumbersRef.current.scrollTop = targetRef.current.scrollTop;
          }
      } else {
          targetRef.current.scrollTop = 0;
          if (targetLineNumbersRef.current) {
            targetLineNumbersRef.current.scrollTop = 0;
          }
      }
    }
    setTimeout(() => { isSyncingScroll.current = false; }, 50); // Debounce/unlock after a short delay
  };

  return (
    <div className="App">
      <header className="App-header">
        {/* <h1>Comment Remover</h1> */}
        <div className="controls-container">
          <div className="options">
            <div className="mode-selector">
              <label className="mode-option">
                <input 
                  type="radio" 
                  name="mode" 
                  value="latex" 
                  checked={mode === 'latex'} 
                  onChange={(e) => setMode(e.target.value)} 
                />
                LaTeX
              </label>
              <label className="mode-option">
                <input 
                  type="radio" 
                  name="mode" 
                  value="python" 
                  checked={mode === 'python'} 
                  onChange={(e) => setMode(e.target.value)} 
                />
                Python
              </label>
              <label className="mode-option">
                <input 
                  type="radio" 
                  name="mode" 
                  value="markdown" 
                  checked={mode === 'markdown'} 
                  onChange={(e) => setMode(e.target.value)} 
                />
                Markdown
              </label>
            </div>
          </div>
          <label className={`option-label ${mode !== 'latex' ? 'hidden' : ''}`}>
            <input 
              type="checkbox" 
              checked={removeAppendix} 
              onChange={() => setRemoveAppendix(!removeAppendix)}
              disabled={mode !== 'latex'}
            />
            Remove Appendix
          </label>
          <label className={`option-label ${mode !== 'python' ? 'hidden' : ''}`}>
            <input 
              type="checkbox" 
              checked={removeDocstrings} 
              onChange={() => setRemoveDocstrings(!removeDocstrings)}
              disabled={mode !== 'python'}
            />
            Remove Docstrings
          </label>
        </div>
      </header>
      <div className="container">
        <div className="editor-wrapper">
          <div 
            ref={leftLineNumbersRef}
            className="line-numbers"
          >
            {leftLineNumbers}
          </div>
          <div
            ref={leftPaneRef}
            className="editor-pane"
            contentEditable
            onInput={handleInputChange}
            onScroll={() => handleScroll(leftPaneRef, rightPaneRef, leftLineNumbersRef, rightLineNumbersRef)}
            suppressContentEditableWarning={true}
            placeholder={`Paste your ${mode === 'latex' ? 'LaTeX' : mode === 'python' ? 'Python' : 'Markdown'} code here...`}
          >
          </div>
        </div>
        <div className="editor-wrapper">
          <div 
            ref={rightLineNumbersRef}
            className="line-numbers"
          >
            {rightLineNumbers}
          </div>
          <div
            ref={rightPaneRef}
            className="editor-pane syntax-highlighted-pane"
            contentEditable // Allows selection and focus
            onScroll={() => handleScroll(rightPaneRef, leftPaneRef, rightLineNumbersRef, leftLineNumbersRef)}
            onKeyDown={(e) => {
              // Allow Ctrl+A (select all) and Ctrl+C (copy)
              // metaKey is for Command key on Mac
              // Use e.code instead of e.key to work with any keyboard layout
              const code = e.code;
              if ((e.ctrlKey || e.metaKey) && (code === 'KeyA' || code === 'KeyC')) {
                return; // Do not prevent default for these combinations
              }
              // Prevent default for all other key presses to make it non-editable
              e.preventDefault();
            }}
            suppressContentEditableWarning={true}
            dangerouslySetInnerHTML={{ __html: highlightedRight.replace(/\n/g, '<br />') }}
            // The replace of \n with <br /> is for HTML rendering if not handled by Prism
          >
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
