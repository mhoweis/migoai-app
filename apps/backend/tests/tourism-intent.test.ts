import { isTourismQuestion, isVisualTourismQuestion } from '../src/services/tourism/answer';
import { detectEmirates } from '../src/services/tourism/retrieval';

describe.each([
  ['What is there to see in Al Ain?', true, ['Abu Dhabi']],
  ['What are the top things to do in Sharjah?', true, ['Sharjah']],
  ['What events are on this weekend in Dubai?', false, ['Dubai']],
  ['concerts in Abu Dhabi', false, ['Abu Dhabi']],
  ['ما هي المتاحف في أبوظبي؟', true, ['Abu Dhabi']],
  ['things to do in RAK', true, ['Ras Al Khaimah']],
  ['Where can I take the best photo of Burj Khalifa?', true, []],
  ['What is Jebel Jais?', true, []],
  ['Help me plan a date night', false, []],
  ['Suggest events based on my interests', false, []],
  ['Find free events near me', false, []],
])('tourism intent for %s', (question, expected, emirates) => {
  it('detects the emirate and routes only tourism intent', () => {
    expect(detectEmirates(question as string)).toEqual(emirates);
    expect(isTourismQuestion(question as string)).toBe(expected);
  });
});

describe('visual tourism routing', () => {
  it('prioritizes landmark photo questions over place lookup', () => {
    expect(isVisualTourismQuestion('Where can I take the best photo of Burj Khalifa?')).toBe(true);
    expect(isVisualTourismQuestion('Where can I get good coffee near Marina?')).toBe(false);
  });
});
