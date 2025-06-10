// Canvas setup
const canvas = document.getElementById('shipCanvas');
const ctx = canvas.getContext('2d');

// UI elements
const currentLayerSpan = document.getElementById('currentLayer');
const upLayerBtn = document.getElementById('upLayer');
const downLayerBtn = document.getElementById('downLayer');
const blockTypeSelect = document.getElementById('blockType');
const blockOrientationForwardSelect = document.getElementById('blockOrientationForward');
const blockOrientationUpSelect = document.getElementById('blockOrientationUp');
const placeBlockBtn = document.getElementById('placeBlock');
const importFile = document.getElementById('importFile');
const importBtn = document.getElementById('importBtn');
const exportFileNameInput = document.getElementById('exportFileName');
const exportBtn = document.getElementById('exportBtn');
const helpBtn = document.getElementById('helpBtn');

// Global state
let allBlocks = []; // Stores all blocks across all layers
let currentLayer = 0; // Current Z-coordinate layer
const BLOCK_PIXEL_SIZE = 20; // Size of each block on canvas in pixels
const GRID_SIZE = 1; // Representing 1x1 grid for Space Engineers blocks

let isMouseDown = false; // New flag to track mouse button state
let lastPlacedX = -1; // To prevent placing multiple blocks in the same cell on mousemove
let lastPlacedY = -1;

// Function to draw a single block
function drawBlock(block, isCurrentLayer = true) {
    const x = block.Min.x * BLOCK_PIXEL_SIZE;
    const y = block.Min.y * BLOCK_PIXEL_SIZE;
    
    // Adjust color for previous layers
    if (!isCurrentLayer) {
        ctx.fillStyle = 'rgba(100, 100, 100, 0.5)'; // Greyed out and semi-transparent
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.5)';
    } else {
        // Basic block colors - could be extended based on SubtypeName or ColorMaskHSV
        switch(block.SubtypeName) {
            case 'OpenCockpitLarge':
                ctx.fillStyle = '#f0e68c'; // Khaki
                break;
            case 'SmallLight':
                ctx.fillStyle = '#ffeb3b'; // Yellow
                break;
            case 'Window1x1Flat':
            case 'Window1x1Slope':
                ctx.fillStyle = '#87ceeb'; // SkyBlue
                break;
            default:
                ctx.fillStyle = '#66bb6a'; // Light green for armor blocks
        }
        ctx.strokeStyle = '#333'; // Darker border
    }

    ctx.fillRect(x, y, BLOCK_PIXEL_SIZE, BLOCK_PIXEL_SIZE);
    ctx.strokeRect(x, y, BLOCK_PIXEL_SIZE, BLOCK_PIXEL_SIZE);

    // Optional: Add text for subtype for debugging/clarity
    // ctx.fillStyle = isCurrentLayer ? 'black' : 'rgba(0,0,0,0.7)';
    // ctx.font = '8px Arial';
    // ctx.fillText(block.SubtypeName.substring(0, 5), x + 2, y + BLOCK_PIXEL_SIZE / 2);
}

// Function to draw grid lines
function drawGrid() {
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvas.width / BLOCK_PIXEL_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(i * BLOCK_PIXEL_SIZE, 0);
        ctx.lineTo(i * BLOCK_PIXEL_SIZE, canvas.height);
        ctx.stroke();
    }
    for (let i = 0; i < canvas.height / BLOCK_PIXEL_SIZE; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * BLOCK_PIXEL_SIZE);
        ctx.lineTo(canvas.width, i * BLOCK_PIXEL_SIZE);
        ctx.stroke();
    }
}

// Function to redraw the entire canvas
function redrawCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    allBlocks.forEach(block => {
        if (block.Min.z === currentLayer - 1) { // Only show the layer directly below
            drawBlock(block, false); // Grey out previous layer
        } else if (block.Min.z === currentLayer) {
            drawBlock(block, true); // Draw current layer normally
        }
    });
    currentLayerSpan.textContent = currentLayer;
}

// Helper function to handle block placement/removal
function handleCanvasInteraction(event) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / BLOCK_PIXEL_SIZE);
    const y = Math.floor((event.clientY - rect.top) / BLOCK_PIXEL_SIZE);

    // Only act if the mouse has moved to a new cell or it's the initial click
    if (x === lastPlacedX && y === lastPlacedY && isMouseDown) {
        return; 
    }
    lastPlacedX = x;
    lastPlacedY = y;

    const existingBlockIndex = allBlocks.findIndex(block => 
        block.Min.x === x && 
        block.Min.y === y && 
        block.Min.z === currentLayer
    );

    if (existingBlockIndex !== -1) {
        allBlocks.splice(existingBlockIndex, 1);
    } else {
        const newBlock = {
            SubtypeName: blockTypeSelect.value,
            Min: { x: x, y: y, z: currentLayer },
            BlockOrientation: {
                Forward: blockOrientationForwardSelect.value,
                Up: blockOrientationUpSelect.value
            },
            ColorMaskHSV: { x: 0.0, y: 0.025842696629213346, z: 0.2453125 } // Default color
        };
        allBlocks.push(newBlock);
    }
    
    redrawCanvas();
}

// Event Listeners
upLayerBtn.addEventListener('click', () => {
    currentLayer++;
    redrawCanvas();
});

downLayerBtn.addEventListener('click', () => {
    if (currentLayer > 0) {
        currentLayer--;
        redrawCanvas();
    }
});

canvas.addEventListener('mousedown', (event) => {
    isMouseDown = true;
    handleCanvasInteraction(event); // Place first block on mousedown
});

canvas.addEventListener('mouseup', () => {
    isMouseDown = false;
    lastPlacedX = -1; // Reset last placed coordinates
    lastPlacedY = -1;
});

canvas.addEventListener('mousemove', (event) => {
    if (isMouseDown) {
        handleCanvasInteraction(event);
    }
});

// Prevent context menu on right-click, if needed for future features
canvas.addEventListener('contextmenu', (event) => {
    event.preventDefault();
});

// Import functionality
importBtn.addEventListener('click', async () => {
    const file = importFile.files[0];
    if (!file) {
        alert('Please select an SBC file to import.');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/import_sbc', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const data = await response.json();
            if (data.blocks) {
                allBlocks = data.blocks;
                // Find the highest Z-coordinate to set the initial layer
                const maxZ = allBlocks.reduce((max, block) => Math.max(max, block.Min.z), 0);
                currentLayer = maxZ; 
                redrawCanvas();
                alert('SBC file imported successfully!');
            } else if (data.error) {
                alert(`Error importing file: ${data.error}`);
            }
        } else {
            const errorData = await response.json();
            alert(`Error importing file: ${errorData.error}`);
        }
    } catch (error) {
        console.error('Error during import:', error);
        alert('An error occurred during import. Check console for details.');
    }
});

// Export functionality
exportBtn.addEventListener('click', async () => {
    const filename = exportFileNameInput.value.trim();
    if (!filename) {
        alert('Please enter a filename for the exported SBC file.');
        return;
    }

    // Capture canvas as image data URL
    const imageDataURL = canvas.toDataURL('image/png'); // Default to PNG

    try {
        const response = await fetch('/export_sbc', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                blocks: allBlocks,
                filename: filename.endsWith('.sbc') ? filename : `${filename}.sbc`,
                thumbnail: imageDataURL // Send the thumbnail data
            })
        });

        if (response.ok) {
            const data = await response.json();
            alert(data.message); // Display the success message from the backend
        } else {
            const errorData = await response.json();
            alert(`Error exporting file: ${errorData.error}`);
        }
    } catch (error) {
        console.error('Error during export:', error);
        alert('An error occurred during export. Check console for details.');
    }
});

// Help button functionality
helpBtn.addEventListener('click', () => {
    const helpContent = `
        <h2 style="color: #61afef;">How to Import Your Ship Blueprint into Space Engineers:</h2>
        <ol style="color: #abb2bf; line-height: 1.6;">
            <li>
                <strong style="color: #e06c75;">Locate Your Blueprints Folder:</strong><br>
                Navigate to your Space Engineers local blueprints directory. This is usually located at:<br>
                <code style="background-color: #4b535e; padding: 2px 5px; border-radius: 4px;">C:\\Users\\[Your Username]\\AppData\\Roaming\\SpaceEngineers\\Blueprints\\local</code><br>
                <em style="color: #7f9f6e;">Note: The \'AppData\' folder might be hidden. You may need to enable "Show hidden files" in your operating system\'s folder options.</em>
            </li>
            <li>
                <strong style="color: #e06c75;">Place Your Blueprint Folder:</strong><br>
                Move the entire folder that was just exported by this tool (e.g., <code style="background-color: #4b535e; padding: 2px 5px; border-radius: 4px;">MyAwesomeShip</code>, which contains <code style="background-color: #4b535e; padding: 2px 5px; border-radius: 4px;">bp.sbc</code> and <code style="background-color: #4b535e; padding: 2px 5px; border-radius: 4px;">thumb.png</code>) into the <code style="background-color: #4b535e; padding: 2px 5px; border-radius: 4px;">local</code> directory you found in step 1.
            </li>
            <li>
                <strong style="color: #e06c75;">Refresh Blueprints in Game (Optional but Recommended):</strong><br>
                If you encounter issues, sometimes Space Engineers creates a <code style="background-color: #4b535e; padding: 2px 5px; border-radius: 4px;">bp.sbcB5</code> file. If this file exists in your blueprint\'s folder, you can delete it. This forces the game to re-read <code style="background-color: #4b535e; padding: 2px 5px; border-radius: 4px;">bp.sbc</code>.
            </li>
            <li>
                <strong style="color: #e06c75;">Launch Space Engineers:</strong><br>
                Start Space Engineers. Your new blueprint should now appear in the in-game blueprint screen (usually accessed by pressing <code style="background-color: #4b535e; padding: 2px 5px; border-radius: 4px;">F10</code> in creative mode).
            </li>
        </ol>
    `;

    const helpWindow = window.open('', 'HelpWindow', 'width=700,height=500,resizable=yes,scrollbars=yes');
    helpWindow.document.body.innerHTML = helpContent;
    helpWindow.document.title = 'Space Engineers Blueprint Import Help';
});

// Initial draw
redrawCanvas(); 