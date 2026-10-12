# README tour

Records the GIF at `docs/assets/resolve-tour.gif` against the real stack (no mocks). The data are the demo data of the development realm; the password `demo` is public on purpose.

1. Start the stack with the demo data, as in «Run it yourself» in the main README (`SPRING_FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/demo`). Start from an empty database (`down -v`): the tour sends one reply, and it stays in the conversation.
2. Record (Chromium, 1280×800, light theme, Spanish; needs `npm ci` in `frontend/` and the Playwright browsers):

   ```sh
   BASE_URL=http://localhost:8080 node scripts/readme-tour/record.mjs /tmp/tour
   ```

   It saves the frames of a CDP screencast and their timestamps in `/tmp/tour`; if a step fails, `failure.png` shows where.
3. Build the GIF (Pillow only, no ffmpeg; width 1000 px, 10 fps):

   ```sh
   python3 -m venv /tmp/tour-venv && /tmp/tour-venv/bin/pip install pillow
   /tmp/tour-venv/bin/python scripts/readme-tour/make_gif.py /tmp/tour docs/assets/resolve-tour.gif 1000 10
   ```

The administrator of the demo data belongs to a single workspace, so the tour shows «Tus espacios» instead of switching workspace.
