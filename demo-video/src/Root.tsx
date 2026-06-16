import "./index.css";
import { Composition } from "remotion";
import { AnnaRemembers } from "./AnnaRemembers";
import { ArchitectureDiagram } from "./architecture/ArchitectureDiagram";
import { ChatFlowDiagram } from "./architecture/ChatFlowDiagram";
import {
  CHAT_ESCALATION_FRAMES,
  ChatEscalationDiagram,
} from "./architecture/ChatEscalationDiagram";
import {
  SYMPTOM_TRENDS_FRAMES,
  SymptomTrendsDiagram,
} from "./architecture/SymptomTrendsDiagram";
import { EscalationDiagram } from "./architecture/EscalationDiagram";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="AnnaRemembers"
        component={AnnaRemembers}
        durationInFrames={7470}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Architectuur"
        component={ArchitectureDiagram}
        durationInFrames={510}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ChatFlow"
        component={ChatFlowDiagram}
        durationInFrames={540}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="ChatEscalation"
        component={ChatEscalationDiagram}
        durationInFrames={CHAT_ESCALATION_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Escalation"
        component={EscalationDiagram}
        durationInFrames={480}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SymptomTrends"
        component={SymptomTrendsDiagram}
        durationInFrames={SYMPTOM_TRENDS_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
