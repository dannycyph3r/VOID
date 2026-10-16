import { useEffect, useState } from 'react';
import { setSoundEnabled } from './engine/audio.ts';
import { navigate, useRoute } from './router.ts';
import { Flight, type Finished } from './screens/Flight.tsx';
import { Home } from './screens/Home.tsx';
import { HowTo } from './screens/HowTo.tsx';
import { Result } from './screens/Result.tsx';
import { Stages } from './screens/Stages.tsx';
import { Stats } from './screens/Stats.tsx';
import { useSettings } from './state/settings.ts';

export function App() {
  const route = useRoute();
  const { settings, update, reducedMotion } = useSettings();
  const [finished, setFinished] = useState<Finished | null>(null);

  useEffect(() => { setSoundEnabled(settings.sound); }, [settings.sound]);
  useEffect(() => {
    document.documentElement.classList.toggle('still', reducedMotion);
  }, [reducedMotion]);
  // New screen: start at the top.
  useEffect(() => { window.scrollTo(0, 0); }, [route.name]);

  switch (route.name) {
    case 'home': return <Home settings={settings} onSettings={update} />;
    case 'stages': return <Stages sel={route.sel} />;
    case 'flight':
      return (
        <Flight
          key={route.id}
          id={route.id}
          settings={settings}
          onSettings={update}
          reducedMotion={reducedMotion}
          onFinish={(f) => { setFinished(f); navigate('result'); }}
        />
      );
    case 'result': return <Result finished={finished} />;
    case 'stats': return <Stats tab={route.tab} stage={route.stage} />;
    case 'how': return <HowTo />;
  }
}
