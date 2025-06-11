// Utility to export/import localStorage data between different ports

export interface LocalStorageData {
  voiceKarteModes?: string;
  voiceKarteApiKey?: string;
}

export function exportLocalStorageData(): string {
  const data: LocalStorageData = {
    voiceKarteModes: localStorage.getItem('voiceKarteModes') || undefined,
    voiceKarteApiKey: localStorage.getItem('voiceKarteApiKey') || undefined,
  };
  return JSON.stringify(data, null, 2);
}

export function importLocalStorageData(jsonData: string): void {
  try {
    const data: LocalStorageData = JSON.parse(jsonData);
    
    if (data.voiceKarteModes) {
      localStorage.setItem('voiceKarteModes', data.voiceKarteModes);
    }
    
    if (data.voiceKarteApiKey) {
      localStorage.setItem('voiceKarteApiKey', data.voiceKarteApiKey);
    }
    
    // Reload the page to apply the imported data
    window.location.reload();
  } catch (error) {
    throw new Error('Invalid JSON data');
  }
}