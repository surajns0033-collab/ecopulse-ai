import { AQICard } from './AirQualityCard.jsx';
import { MapLocationCard } from './MapLocationCard.jsx';
import { MeetupListCard, MeetupPreviewCard } from './MeetupCards.jsx';
import { ReportPreviewCard } from './ReportPreviewCard.jsx';
import { EmailPreviewCard } from './EmailPreviewCard.jsx';
import { ConfirmationCard, ImageAnalysisCard, CommunityFeedCard, DailyPlanCard, WaterQualityCard } from './CommunityCards.jsx';

export { AQICard } from './AirQualityCard.jsx';
export { MapLocationCard } from './MapLocationCard.jsx';
export { MeetupListCard, MeetupPreviewCard } from './MeetupCards.jsx';
export { ReportPreviewCard } from './ReportPreviewCard.jsx';
export { EmailPreviewCard } from './EmailPreviewCard.jsx';
export { ConfirmationCard, ImageAnalysisCard, CommunityFeedCard, DailyPlanCard, WaterQualityCard } from './CommunityCards.jsx';

export default function InlineCards({ cards, onAction }) {
  if (!cards || cards.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
      {cards.map((card, i) => {
        switch (card.type) {
          case 'aqi':
            return <AQICard key={i} data={card.data} />;
          case 'map':
            return <MapLocationCard key={i} data={card.data} />;
          case 'meetup-list':
            return (
              <MeetupListCard
                key={i}
                data={card.data}
                onJoin={ev => onAction?.('JOIN_MEETUP', ev)}
                onLeave={ev => onAction?.('CANCEL_MEETUP', ev)}
              />
            );
          case 'meetup-preview':
            return (
              <MeetupPreviewCard
                key={i}
                data={card.data}
                onPublish={(d) => onAction && onAction('PUBLISH_MEETUP', d)}
                onCancel={() => onAction && onAction('CANCEL', null)}
              />
            );
          case 'report-preview':
            return (
              <ReportPreviewCard
                key={i}
                data={card.data}
                onSubmit={(d) => onAction && onAction('SUBMIT_REPORT', d)}
                onCancel={() => onAction && onAction('CANCEL', null)}
              />
            );
          case 'email-preview':
            return (
              <EmailPreviewCard
                key={i}
                data={card.data}
                onSave={(d) => onAction && onAction('SAVE_EMAIL_DRAFT', d)}
                onCancel={() => onAction && onAction('CANCEL', null)}
              />
            );
          case 'confirmation':
            return <ConfirmationCard key={i} data={card.data} />;
          case 'image-analysis':
            return <ImageAnalysisCard key={i} data={card.data} />;
          case 'community-feed':
            return <CommunityFeedCard key={i} data={card.data} />;
          case 'daily-plan':
            return <DailyPlanCard key={i} data={card.data} />;
          case 'water-quality':
            return <WaterQualityCard key={i} data={card.data} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
