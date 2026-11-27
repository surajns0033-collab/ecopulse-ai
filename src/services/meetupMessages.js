export function attendanceMessage(result) {
  if (result.full) return 'The last place has been taken. This event is full.';
  const message = result.joined
    ? (result.changed ? 'Your place is confirmed.' : 'You already have a place.')
    : (result.changed ? 'Your place has been cancelled.' : 'You have no place reserved.');
  return result.localOnly ? message + ' Saved on this device.' : message;
}

export function meetupErrorMessage(error) {
  if (error?.code === 'permission-denied') return 'Access was denied. Check your sign-in and try again.';
  if (error?.code) return 'Could not reach the meetup service. Check your connection and try again.';
  return error?.message || 'Could not update attendance. Please try again.';
}
