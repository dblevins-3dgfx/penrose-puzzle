// The app: the jigsaw (spec 11) or the free-building sandbox, switched in
// the header.
import { useState } from 'react';
import { Jigsaw } from './ui/Jigsaw';
import { ModeSwitch, type Mode } from './ui/ModeSwitch';
import { Sandbox } from './ui/Sandbox';

const PenrosePuzzle = () => {
  const [mode, setMode] = useState<Mode>('jigsaw');
  const modeSwitch = <ModeSwitch mode={mode} onChange={setMode} />;
  return mode === 'jigsaw' ? <Jigsaw modeSwitch={modeSwitch} /> : <Sandbox modeSwitch={modeSwitch} />;
};

export default PenrosePuzzle;
