import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { tools } from '../services/agentTools';
import { useAuth } from '../contexts/AuthContext';
import { useApp } from '../contexts/AppContext';
import { attendanceMessage, meetupErrorMessage } from '../services/meetups';
import { useMeetups } from '../components/meetups/useMeetups';

function emptyMeetupForm() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { title: '', category: 'cleanup', location: null, date: format(tomorrow, 'yyyy-MM-dd'),
    time: '7:00 AM', capacity: 25, description: '' };
}

export function useMeetupListing() {

  const { user } = useAuth();
  const { location } = useApp();
  const { events, joinedIds, loading, error, retry } = useMeetups(user?.uid);
  const [pending, setPending] = useState(new Set());
  const [activeFilter, setActiveFilter] = useState('all');
  const visibleEvents = events.filter(event => activeFilter === 'all' || event.category === activeFilter);
  const [toastMsg, setToastMsg] = useState('');
  const dialog = useRef(null);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState(emptyMeetupForm);
  const venue = form.location ?? location?.city ?? '';

  function openCreate() {
    if (user?.isAnonymous && !user.isLocal) {
      setToastMsg('Sign in with Google or email to publish a meetup.');
      return;
    }
    setFormError('');
    dialog.current.showModal();
    dialog.current.querySelector('#meetup-title').focus();
  }

  async function handleCreateSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.title.trim() || !venue.trim()) {
      setFormError('Please enter event title and location.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await tools.createMeetup({
        userId: user?.uid || 'guest',
        organizer: user?.displayName || 'Community Member',
        title: form.title.trim(),
        category: form.category,
        location: venue.trim(),
        date: form.date,
        time: form.time.trim() || '7:00 AM',
        capacity: Number(form.capacity) || 25,
        description: form.description.trim() || `Community ${form.category} meetup in ${venue.trim()}.`,
      });
      dialog.current.close();
      setForm(emptyMeetupForm());
      setToastMsg(result.localOnly ? 'Meetup saved on this device.' : 'Meetup published.');
    } catch (error) {
      const message = meetupErrorMessage(error);
      if (dialog.current?.open) setFormError(message);
      else setToastMsg(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function changePlace(event, joining) {
    if (!user) return;
    const id = event.id || event.eventId;
    setPending(previous => new Set(previous).add(id));
    try {
      const save = joining ? tools.joinMeetup : tools.cancelMeetupRSVP;
      const result = await save({ userId: user.uid, meetupDocId: event.id, meetupId: event.eventId });
      setToastMsg(attendanceMessage(result));
    } catch (error) {
      setToastMsg(meetupErrorMessage(error));
    } finally {
      setPending(previous => {
        const next = new Set(previous);
        next.delete(id);
        return next;
      });
    }
  }

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => setToastMsg(''), 6000);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  return { dialog, form, setForm, venue, handleCreateSubmit, formError, submitting,
    loading, error, retry, joinedIds, pending, activeFilter, setActiveFilter, visibleEvents, toastMsg, openCreate, changePlace };
}
