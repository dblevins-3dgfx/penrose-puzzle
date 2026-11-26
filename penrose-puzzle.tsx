// The app: the jigsaw (spec 9) and the free-building sandbox (spec 4–8),
// switched in the header. Both modes stay mounted once visited so switching
// tabs preserves each mode's board state, camera, and settings cleanly.
import { useState } from 'react';
import { Jigsaw } from './ui/Jigsaw';
import { ModeSwitch, type Mode } from './ui/ModeSwitch';
import { Sandbox } from './ui/Sandbox';
import { useSharedSettings } from './ui/useSharedSettings';

const PenrosePuzzle = () => {
  const [mode, setMode] = useState<Mode>('jigsaw');
  const [visitedSandbox, setVisitedSandbox] = useState(false);
  const [settings, setSettings] = useSharedSettings();

  const handleModeChange = (next: Mode) => {
    if (next === 'sandbox') setVisitedSandbox(true);
    setMode(next);
  };

  const modeSwitch = <ModeSwitch mode={mode} onChange={handleModeChange} />;

  return (
    <>
      <div className={mode === 'jigsaw' ? 'w-full h-dvh' : 'hidden'}>
        <Jigsaw
          modeSwitch={modeSwitch}
          active={mode === 'jigsaw'}
          settings={settings}
          onChangeSettings={setSettings}
        />
      </div>
      {visitedSandbox && (
        <div className={mode === 'sandbox' ? 'w-full h-dvh' : 'hidden'}>
          <Sandbox
            modeSwitch={modeSwitch}
            active={mode === 'sandbox'}
            settings={settings}
            onChangeSettings={setSettings}
          />
        </div>
      )}
    </>
  );
};

export default PenrosePuzzle;
