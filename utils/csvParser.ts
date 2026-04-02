/**
 * Utility function to properly parse CSV lines, handling quoted values
 * Removes surrounding quotes and trims whitespace
 */
export const parseCSVValue = (value: string): string => {
  if (!value) return '';
  // Remove surrounding quotes if present, then trim whitespace
  return value.replace(/^["']|["']$/g, '').trim();
};

/**
 * Parse a CSV line properly, handling quoted values and commas within quotes
 */
export const parseCSVLine = (line: string): string[] => {
  const result = [];
  let current = '';
  let insideQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Handle escaped quotes
        current += '"';
        i++;
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Found a field separator
      result.push(parseCSVValue(current));
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last field
  result.push(parseCSVValue(current));
  
  return result;
};

/**
 * Parse a CSV header line
 */
export const parseCSVHeaders = (line: string): string[] => {
  return parseCSVLine(line);
};

/**
 * Parse a complete CSV text
 */
export const parseCSVText = (text: string): { headers: string[]; rows: Record<string, string>[] } => {
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  
  const headers = parseCSVHeaders(lines[0]);
  const rows = lines.slice(1).map(line => {
    const values = parseCSVLine(line);
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    return obj;
  });
  
  return { headers, rows };
};
