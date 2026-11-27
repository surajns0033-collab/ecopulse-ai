import { Send, MapPin } from 'lucide-react';

export function CommunityComposer({ user, communityNameConfirmed, handleSignInToPost, handleSendPost, postCity, setPostCity, msgText, setMsgText, sending }) {
  return <>
      {user?.isAnonymous ? (
        <div className="community-readonly">
          <span>Guest mode is read-only in the public channel.</span>
          <button onClick={handleSignInToPost}>Sign in to post</button>
        </div>
      ) : !communityNameConfirmed ? (
        <div className="community-readonly">
          <span>Choose and save your public name above to join the conversation.</span>
        </div>
      ) : (
      <form className="community-composer" onSubmit={handleSendPost}>
        <div className="community-composer-loc">
          <MapPin size={12} color="#16a34a" />
          <input
            type="text"
            value={postCity}
            onChange={(e) => setPostCity(e.target.value)}
            placeholder="Your city (e.g. Bengaluru)"
            aria-label="Your city"
          />
        </div>
        <div className="community-composer-row">
          <input
            type="text"
            className="community-composer-input"
            placeholder="Share an update in the public channel..."
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            maxLength={1000}
            aria-label="Community message"
          />
          <button
            type="submit"
            className="send-btn"
            disabled={!msgText.trim() || sending}
            aria-label="Post message"
          >
            <Send size={16} />
          </button>
        </div>
      </form>
      )}
  </>;
}
