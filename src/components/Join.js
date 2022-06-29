import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

export default function Join() {
	const navigate = useNavigate();
	const { register, handleSubmit } = useForm();
	const onValid = ({ name, room }) => {
		if (name && room) {
			navigate(`/chat/?${room}`, { state: { name, room } });
		}
	};
	return (
		<Container>
			<h1>Welcome to Nomad Catch</h1>
			<Form onSubmit={handleSubmit(onValid)}>
				<input
					{...register('name', { required: true })}
					placeholder='Username'
				/>
				<input
					{...register('room', { required: true })}
					placeholder='Room Name'
				/>
				<button>입장</button>
			</Form>
		</Container>
	);
}
const Container = styled.div`
	width: 100%;
	height: 100vh;
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	h1 {
		font-size: 30px;
		font-weight: 600;
		margin-bottom: 50px;
	}
`;

const Form = styled.form`
	display: flex;
	flex-direction: column;
	justify-content: center;
	align-items: center;
	input {
		width: 100%;
		border: 1px solid gray;
		padding: 10px;
		border-radius: 999px;
		margin-bottom: 15px;
	}
	button {
		cursor: pointer;
		width: 100%;
		padding: 10px;
		border-radius: 999px;
		background-color: blueviolet;
		color: white;
		text-align: center;
	}
`;
