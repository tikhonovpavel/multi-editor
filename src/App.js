import React, { useState, useEffect, useRef } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-latex'; // Import LaTeX language support
import 'prismjs/themes/prism.css'; // Default Prism theme, you can choose others
import './App.css';

function App() {
  const [rawText, setRawText] = useState(''); // Stores plain text from left pane
  // highlightedLeft state is no longer needed for direct rendering of left pane
  const [highlightedRight, setHighlightedRight] = useState('');
  const [removeAppendix, setRemoveAppendix] = useState(false); // State for appendix removal

  const leftPaneRef = useRef(null);
  const rightPaneRef = useRef(null);
  const isSyncingScroll = useRef(false); // To prevent scroll event loops

  // Helper function to save selection based on character offsets
  const saveSelection = (containerEl) => {
    if (!containerEl || !window.getSelection || !document.createRange) return null;
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const preCaretRange = range.cloneRange();
        preCaretRange.selectNodeContents(containerEl);
        preCaretRange.setEnd(range.startContainer, range.startOffset);
        const start = preCaretRange.toString().length;

        preCaretRange.setEnd(range.endContainer, range.endOffset);
        const end = preCaretRange.toString().length;
        return { start, end, collapsed: range.collapsed };
    }
    return null;
  };

  // Helper function to restore selection based on character offsets
  const restoreSelection = (containerEl, savedSel) => {
    if (!containerEl || !savedSel || !window.getSelection || !document.createRange) return;

    let charIndex = 0;
    const range = document.createRange();
    range.setStart(containerEl, 0); // Default start
    range.collapse(true); // Default to collapsed

    let nodeStack = [containerEl];
    let node, foundStart = false, foundEnd = false;

    // Traverse the tree to find the text nodes corresponding to the character offsets
    while ((node = nodeStack.pop()) && (!foundStart || !foundEnd)) {
        if (node.nodeType === Node.TEXT_NODE) {
            const nextCharIndex = charIndex + node.length;
            if (!foundStart && savedSel.start >= charIndex && savedSel.start <= nextCharIndex) {
                range.setStart(node, savedSel.start - charIndex);
                foundStart = true;
            }
            if (!foundEnd && savedSel.end >= charIndex && savedSel.end <= nextCharIndex) {
                range.setEnd(node, savedSel.end - charIndex);
                foundEnd = true;
            }
            charIndex = nextCharIndex;
        } else {
            let i = node.childNodes.length;
            while (i--) { // Add children in reverse order for DFS-like traversal
                nodeStack.push(node.childNodes[i]);
            }
        }
    }
    
    if (foundStart && !foundEnd && savedSel.collapsed) {
        range.collapse(true);
    }

    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  };

  const handleInputChange = (event) => {
    const editorDiv = leftPaneRef.current;
    if (!editorDiv) return;

    const currentText = editorDiv.innerText;

    const selection = saveSelection(editorDiv);

    setRawText(currentText);

    const textToHighlightInLeft = currentText.replace(/\n{3,}/g, '\n\n');
    const highlightedHTMLForLeft = Prism.highlight(textToHighlightInLeft, Prism.languages.latex, 'latex');
    
    editorDiv.innerHTML = highlightedHTMLForLeft;

    if (selection) {
      restoreSelection(editorDiv, selection);
    }

    processOutput(currentText);
  };

  // Separated the processing logic for reusability
  const processOutput = (text) => {
    // First remove comments
    let processedText = text.split('\n').map(line => {
      const commentIndex = line.indexOf('%');
      if (commentIndex !== -1 && (commentIndex === 0 || line[commentIndex - 1] !== '\\')) {
        return line.substring(0, commentIndex);
      }
      return line;
    }).join('\n');
    
    // Then handle appendix removal if enabled
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
    
    processedText = processedText.replace(/\n{3,}/g, '\n\n');
    const highlightedOutputForRight = Prism.highlight(processedText, Prism.languages.latex, 'latex');
    setHighlightedRight(highlightedOutputForRight);
  };

  // Update output when removeAppendix changes
  useEffect(() => {
    if (rawText) {
      processOutput(rawText);
    }
  }, [removeAppendix]); // Re-process when this option changes

  useEffect(() => {
    // Initialize right pane or update if rawText was empty
    if (rawText) {
      processOutput(rawText);
    }
  }, []); // Run only on initial mount

  // Synchronized scrolling
  const handleScroll = (sourceRef, targetRef) => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (sourceRef.current && targetRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = sourceRef.current;
      const scrollableHeight = scrollHeight - clientHeight;
      if (scrollableHeight > 0) {
          const scrollRatio = scrollTop / scrollableHeight;
          targetRef.current.scrollTop = scrollRatio * (targetRef.current.scrollHeight - targetRef.current.clientHeight);
      } else {
          targetRef.current.scrollTop = 0;
      }
    }
    setTimeout(() => { isSyncingScroll.current = false; }, 50); // Debounce/unlock after a short delay
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>LaTeX Comment Remover</h1>
        <div className="options">
          <label className="option-label">
            <input 
              type="checkbox" 
              checked={removeAppendix} 
              onChange={() => setRemoveAppendix(!removeAppendix)} 
            />
            Remove Appendix
          </label>
        </div>
      </header>
      <div className="container">
        <div
          ref={leftPaneRef}
          className="editor-pane syntax-highlighted-pane"
          contentEditable
          onInput={handleInputChange}
          onScroll={() => handleScroll(leftPaneRef, rightPaneRef)}
          suppressContentEditableWarning={true}
          placeholder="Paste your LaTeX code here..."
        >
        </div>
        <div
          ref={rightPaneRef}
          className="editor-pane syntax-highlighted-pane"
          contentEditable // Allows selection and focus
          onScroll={() => handleScroll(rightPaneRef, leftPaneRef)}
          onKeyDown={(e) => {
            // Allow Ctrl+A (select all) and Ctrl+C (copy)
            // metaKey is for Command key on Mac
            const key = e.key.toLowerCase();
            if ((e.ctrlKey || e.metaKey) && (key === 'a' || key === 'c')) {
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
  );
}

export default App;
