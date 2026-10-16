# LiftFlow 3D Elevator Simulator

A static Three.js elevator simulation with a cutaway 10-floor building, two animated elevator cars, orbit camera, hall calls, destination buttons, passenger generation, dispatch algorithms, capacity control, morning rush, emergency recall, and live statistics.

## Run locally

Because the project uses JavaScript modules, serve it over HTTP rather than opening `index.html` directly.

### Option A: VS Code
1. Open this folder in VS Code.
2. Install the **Live Server** extension if needed.
3. Right-click `index.html` → **Open with Live Server**.

### Option B: Python
From this folder, run:

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deploy to Render
1. Upload `index.html`, `style.css`, `script.js`, and `render.yaml` to the root of a GitHub repository.
2. In Render, choose **New → Static Site** and connect the repository.
3. Build command: `echo "LiftFlow static site ready"`
4. Publish directory: `.`
5. Click **Create Static Site**.

The app imports Three.js and OrbitControls from the unpkg CDN, so users need an internet connection for the 3D engine to load.

## Controls
- Drag the 3D view to rotate; scroll to zoom.
- Use floor up/down buttons to call a car.
- Pick a car in Destination panel and select a floor.
- Switch between Nearest car and Smart dispatch.
- Enable Automatic passengers or Morning rush to stress-test.
- Emergency recall sends both cars to Ground and clears waiting requests.

This is a visual simulation and is not connected to or suitable for controlling real elevator hardware.
