export const checkResponseResult = response => {
  if (typeof response !== 'object') {
    return false;
  }

  if (response?.type === 'success') {
    return true;
  } else {
    return false;
  }
};
